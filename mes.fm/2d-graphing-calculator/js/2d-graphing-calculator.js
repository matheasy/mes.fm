/* MES 2D Graphing Calculator -- expression compiler + numerics (no DOM), prepended to app.js by build_tool_apps.py.
 * Also runs in node: require() it to test. User text is tokenised and parsed by our own grammar and only whitelisted
 * tokens ever reach the generated JavaScript (numbers, our own function table, x/y/t, P["a"] sliders) -- no raw user text is executed. */
var GC = (function () {
	'use strict';
	var DEG = Math.PI / 180;

	function makeM() {
		var M = { deg: false };
		function a(x) { return M.deg ? x * DEG : x; }
		function ia(x) { return M.deg ? x / DEG : x; }
		M.sin = function (x) { return Math.sin(a(x)); };
		M.cos = function (x) { return Math.cos(a(x)); };
		M.tan = function (x) { return Math.tan(a(x)); };
		M.sec = function (x) { return 1 / Math.cos(a(x)); };
		M.csc = function (x) { return 1 / Math.sin(a(x)); };
		M.cot = function (x) { return 1 / Math.tan(a(x)); };
		M.asin = function (x) { return ia(Math.asin(x)); };
		M.acos = function (x) { return ia(Math.acos(x)); };
		M.atan = function (x) { return ia(Math.atan(x)); };
		M.sinh = Math.sinh; M.cosh = Math.cosh; M.tanh = Math.tanh;
		M.sqrt = Math.sqrt; M.cbrt = Math.cbrt; M.abs = Math.abs; M.exp = Math.exp; M.ln = Math.log;
		M.log = function (x, b) { return arguments.length > 1 ? Math.log(x) / Math.log(b) : Math.log10(x); };
		M.log2 = Math.log2; M.log10 = Math.log10;
		M.floor = Math.floor; M.ceil = Math.ceil; M.trunc = Math.trunc; M.sign = Math.sign;
		M.round = function (x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; };
		M.min = Math.min; M.max = Math.max;
		M.mod = function (x, m) { return x - m * Math.floor(x / m); };
		M.pow = function (b, e) {                 // x^(1/3) is the real cube root for negative x, like Desmos
			if (b < 0 && e !== Math.floor(e)) { var r = 1 / e; if (Math.abs(r - Math.round(r)) < 1e-12 && Math.round(r) % 2 !== 0) return -Math.pow(-b, e); return NaN; }
			return Math.pow(b, e);
		};
		M.root = function (n, x) { return M.pow(x, 1 / n); };
		M.fact = function (n) { if (n < 0 || n !== Math.floor(n) || n > 170) return NaN; var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; };
		return M;
	}
	var FNAMES = {
		sin: 'sin', cos: 'cos', tan: 'tan', sec: 'sec', csc: 'csc', cot: 'cot', asin: 'asin', arcsin: 'asin', acos: 'acos', arccos: 'acos', atan: 'atan', arctan: 'atan',
		sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', sqrt: 'sqrt', cbrt: 'cbrt', abs: 'abs', ln: 'ln', log: 'log', log2: 'log2', log10: 'log10', exp: 'exp',
		floor: 'floor', ceil: 'ceil', ceiling: 'ceil', round: 'round', trunc: 'trunc', sign: 'sign', sgn: 'sign', min: 'min', max: 'max', mod: 'mod', root: 'root', nthroot: 'root', fact: 'fact'
	};
	var CONSTS = { pi: Math.PI, 'π': Math.PI, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 };
	var BYLEN = Object.keys(FNAMES).concat(['theta', 'tau', 'phi', 'pi', 'π', 'θ']).sort(function (p, q) { return q.length - p.length; });

	/* ---------- tokenizer ---------- */
	function splitIdent(word, rest, env, out) {
		var i = 0, run = 0;
		while (i < word.length) {
			var hit = null;
			for (var k = 0; k < BYLEN.length; k++) if (word.substr(i, BYLEN[k].length) === BYLEN[k]) { hit = BYLEN[k]; break; }
			var c = word[i];
			if (!hit && env.userFns && env.userFns[c] && i === word.length - 1 && rest[0] === '(') { out.push({ k: 'ufn', v: c }); i++; run = 0; continue; }
			if (hit) {
				run = 0;
				if (hit === 'theta' || hit === 'θ') out.push({ k: 'var', v: 't' });
				else if (CONSTS.hasOwnProperty(hit)) out.push({ k: 'num', v: CONSTS[hit] });
				else out.push({ k: 'fn', v: FNAMES[hit] });
				i += hit.length; continue;
			}
			if (c === 'e') out.push({ k: 'num', v: Math.E });
			else if (c === 'x' || c === 'y' || c === 't') out.push({ k: 'var', v: c });
			else out.push({ k: 'var', v: c, param: true });
			run++; i++;
			if (run >= 4) throw new Error('Unknown name “' + word + '”');
		}
	}
	function tokenize(str, env) {
		var s = String(str).replace(/[×·⋅]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-').replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/³/g, '^3');
		var out = [], i = 0, m;
		while (i < s.length) {
			var c = s[i];
			if (/\s/.test(c)) { i++; continue; }
			if ((m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i)))) { out.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
			if ((m = /^[A-Za-zπθ]+/.exec(s.slice(i)))) {
				var w = m[0], rest = s.slice(i + w.length);
				if (w === 'log' ) { var lm = /^(10|2)(?=\()/.exec(rest); if (lm) { out.push({ k: 'fn', v: 'log' + lm[1] }); i += w.length + lm[1].length; continue; } }
				splitIdent(w, rest, env, out); i += w.length; continue;
			}
			if ('+-*/^(),|⌊⌋⌈⌉!'.indexOf(c) >= 0) { out.push({ k: 'op', v: c }); i++; continue; }
			throw new Error('Unexpected “' + c + '”');
		}
		return out;
	}

	/* ---------- parser -> JS source ---------- */
	function parse(t, env, alias) {
		var i = 0, abs = 0, used = { x: false, y: false, t: false, params: [] };
		function isOp(v) { return t[i] && t[i].k === 'op' && t[i].v === v; }
		function eat(v) { if (isOp(v)) { i++; return true; } return false; }
		function expr() {
			var l = term();
			for (;;) {
				if (eat('+')) l = '(' + l + '+' + term() + ')';
				else if (eat('-')) l = '(' + l + '-' + term() + ')';
				else return l;
			}
		}
		function startsFactor() {
			var x = t[i]; if (!x) return false;
			if (x.k === 'num' || x.k === 'var' || x.k === 'fn' || x.k === 'ufn') return true;
			return x.k === 'op' && (x.v === '(' || x.v === '⌊' || x.v === '⌈' || (x.v === '|' && abs === 0));
		}
		function term() {
			var l = unary();
			for (;;) {
				if (eat('*')) l = '(' + l + '*' + unary() + ')';
				else if (eat('/')) l = '(' + l + '/' + unary() + ')';
				else if (startsFactor()) l = '(' + l + '*' + unary() + ')';
				else return l;
			}
		}
		function unary() { if (eat('-')) return '(-' + unary() + ')'; if (eat('+')) return unary(); return power(); }
		function power() { var b = postfix(); if (eat('^')) return 'M.pow(' + b + ',' + unary() + ')'; return b; }
		function postfix() { var v = primary(); while (eat('!')) v = 'M.fact(' + v + ')'; return v; }
		function args() {
			var a = [];
			if (eat('(')) {
				if (!isOp(')')) { do { a.push(expr()); } while (eat(',')); }
				if (!eat(')') && i < t.length) throw new Error('Missing )');
			} else a.push(unary());
			return a;
		}
		function closer(sym) { if (!eat(sym)) { if (i < t.length) throw new Error('Missing ' + sym); } }
		function primary() {
			var x = t[i];
			if (!x) throw new Error('Unfinished expression');
			if (x.k === 'num') { i++; return '(' + x.v + ')'; }
			if (x.k === 'var') {
				i++;
				if (alias && alias[x.v]) { used.x = true; return alias[x.v]; }
				if (x.param) { if (used.params.indexOf(x.v) < 0) used.params.push(x.v); return 'P["' + x.v + '"]'; }
				used[x.v] = true; return x.v;
			}
			if (x.k === 'fn') {
				i++;
				if (isOp('^')) { i++; var e = primary(); var a1 = args(); return 'M.pow(M.' + x.v + '(' + a1.join(',') + '),' + e + ')'; }   // sin^2(x)
				return 'M.' + x.v + '(' + args().join(',') + ')';
			}
			if (x.k === 'ufn') { i++; return 'F["' + x.v + '"](' + args().join(',') + ')'; }
			if (x.k === 'op') {
				if (x.v === '(') { i++; var v = expr(); closer(')'); return '(' + v + ')'; }
				if (x.v === '|') { i++; abs++; var a = expr(); abs--; closer('|'); return 'Math.abs(' + a + ')'; }
				if (x.v === '⌊') { i++; var f = expr(); closer('⌋'); return 'Math.floor(' + f + ')'; }
				if (x.v === '⌈') { i++; var c = expr(); closer('⌉'); return 'Math.ceil(' + c + ')'; }
			}
			throw new Error('Unexpected “' + x.v + '”');
		}
		var code = expr();
		if (i < t.length) throw new Error(t[i].v === ')' ? 'Extra )' : 'Unexpected “' + t[i].v + '”');
		return { code: code, used: used };
	}
	function build(code, env) { return new Function('P', 'F', 'M', 'return function(x,y,t){return ' + code + ';};')(env.P, env.F, env.M); }
	function compile(src, env, alias) { var p = parse(tokenize(src, env), env, alias); p.fn = build(p.code, env); return p; }

	/* ---------- row analysis ---------- */
	function scan(str, pred) {                  // calls pred(ch, i, depth) for chars outside brackets
		var d = 0;
		for (var i = 0; i < str.length; i++) {
			var c = str[i];
			if (c === '(' || c === '{') d++; else if (c === ')' || c === '}') d--;
			else if (pred(c, i, d) === false) return;
		}
	}
	function splitTop(str, ch) {
		var parts = [], last = 0;
		scan(str, function (c, i, d) { if (d === 0 && c === ch) { parts.push(str.slice(last, i)); last = i + 1; } });
		parts.push(str.slice(last)); return parts;
	}
	function findRel(str) {                     // top-level relation operators
		var ops = [];
		scan(str, function (c, i, d) {
			if (d !== 0) return;
			var two = str.substr(i, 2);
			if (two === '<=' || two === '>=') { ops.push({ pos: i, len: 2, op: two }); }
			else if (c === '≤') ops.push({ pos: i, len: 1, op: '<=' });
			else if (c === '≥') ops.push({ pos: i, len: 1, op: '>=' });
			else if ((c === '<' || c === '>') && str[i + 1] !== '=') ops.push({ pos: i, len: 1, op: c });
			else if (c === '=' && str[i - 1] !== '<' && str[i - 1] !== '>' ) ops.push({ pos: i, len: 1, op: '=' });
		});
		return ops;
	}
	function chainParts(str) {                  // "0<=t<=2π" -> {parts:['0','t','2π'], ops:['<=','<=']}
		var rel = findRel(str), parts = [], last = 0, ops = [];
		rel.forEach(function (r) { parts.push(str.slice(last, r.pos)); ops.push(r.op); last = r.pos + r.len; });
		parts.push(str.slice(last));
		return { parts: parts, ops: ops };
	}
	function cmpCode(a, op, b) { return op === '=' ? '(Math.abs(' + a + '-' + b + ')<1e-9)' : '(' + a + op + b + ')'; }
	function parseCond(str, env) {              // "{x>0, y<5}" / "{0<=t<=2π}" -> {test, tRange}
		var tests = [], tRange = null;
		splitTop(str, ',').forEach(function (piece) {
			var ch = chainParts(piece);
			if (!ch.ops.length) throw new Error('A { } restriction needs a comparison like x>0');
			var codes = ch.parts.map(function (p) { return parse(tokenize(p, env), env).code; });
			var chunks = [];
			for (var k = 0; k < ch.ops.length; k++) chunks.push(cmpCode(codes[k], ch.ops[k], codes[k + 1]));
			tests.push('(' + chunks.join('&&') + ')');
			// t / θ limits: {0<=t<=6.28}
			var isT = function (p) { return /^\s*(t|θ|theta)\s*$/.test(p); }, num = function (p) { var f = compile(p, env).fn; return f(0, 0, 0); };
			try {
				if (ch.ops.length === 2 && isT(ch.parts[1]) && ch.ops[0][0] === '<' && ch.ops[1][0] === '<') tRange = { lo: num(ch.parts[0]), hi: num(ch.parts[2]) };
				else if (ch.ops.length === 1 && isT(ch.parts[0]) && ch.ops[0][0] === '<') tRange = { lo: tRange ? tRange.lo : null, hi: num(ch.parts[1]) };
				else if (ch.ops.length === 1 && isT(ch.parts[0]) && ch.ops[0][0] === '>') tRange = { lo: num(ch.parts[1]), hi: tRange ? tRange.hi : null };
			} catch (e) { /* not constant limits: leave it as a plain condition */ }
		});
		return { test: build(tests.join('&&'), env), tRange: tRange };
	}
	function unwrapParens(s) {
		s = s.trim(); if (s[0] !== '(' || s[s.length - 1] !== ')') return null;
		var d = 0;
		for (var i = 0; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') { d--; if (d === 0 && i < s.length - 1) return null; } }
		return s.slice(1, -1);
	}
	function mix(list) { var p = []; list.forEach(function (c) { c.used.params.forEach(function (n) { if (p.indexOf(n) < 0) p.push(n); }); }); return p; }
	function usesAny(c) { return c.used.x || c.used.y || c.used.t; }

	// text -> {kind, ...}. env = {P, F, M, userFns}. Throws Error with a readable message.
	function analyze(text, env) {
		var src = String(text).trim();
		if (!src) return { kind: 'empty', params: [] };
		var cond = null, m = /\{([^{}]*)\}\s*$/.exec(src);
		if (m) { src = src.slice(0, m.index).trim(); cond = parseCond(m[1], env); }
		var rel = findRel(src), d;
		function wrap(d) { d.cond = cond ? cond.test : null; d.tRange = cond ? cond.tRange : null; return d; }

		if (!rel.length) {
			var inner = unwrapParens(src), pair = inner !== null ? splitTop(inner, ',') : null;
			if (pair && pair.length === 2) {
				var cx = compile(pair[0], env), cy = compile(pair[1], env);
				if (cx.used.t || cy.used.t) return wrap({ kind: 'parametric', fx: cx.fn, fy: cy.fn, params: mix([cx, cy]) });
				return { kind: 'point', x: cx.fn(0, 0, 0), y: cy.fn(0, 0, 0), params: mix([cx, cy]) };
			}
			var c = compile(src, env);
			if (c.used.y || c.used.t) throw new Error(c.used.y ? 'Write it as y = …  (or use x and y with = )' : 'Only x can be the variable here');
			if (!c.used.x && !c.used.params.length) { return { kind: 'func', f: (function (v) { return function () { return v; }; })(c.fn(0, 0, 0)), params: [] }; }
			return wrap({ kind: 'func', f: function (x) { return c.fn(x, 0, 0); }, params: mix([c]) });
		}
		if (rel.length === 1 && rel[0].op === '=') {
			var L = src.slice(0, rel[0].pos).trim(), R = src.slice(rel[0].pos + 1).trim();
			if (!L || !R) throw new Error('Finish the equation');
			var fd = /^([A-Za-z])\(\s*([A-Za-z])\s*\)$/.exec(L);
			if (fd) {
				var alias = {}; alias[fd[2]] = 'x';
				var body = compile(R, env, alias);
				env.F[fd[1]] = function (x) { return body.fn(x, 0, 0); };
				return wrap({ kind: 'func', f: function (x) { return body.fn(x, 0, 0); }, params: mix([body]), def: fd[1] });
			}
			if (L === 'y') {
				var cr = compile(R, env);
				if (!cr.used.y && !cr.used.t) return wrap({ kind: 'func', f: function (x) { return cr.fn(x, 0, 0); }, params: mix([cr]) });
				return wrap({ kind: 'implicit', f: function (x, y) { return y - cr.fn(x, y, 0); }, params: mix([cr]) });
			}
			if (L === 'x') {
				var cx2 = compile(R, env);
				if (!cx2.used.x && !cx2.used.t) return wrap({ kind: 'xfunc', f: function (y) { return cx2.fn(0, y, 0); }, params: mix([cx2]) });
				return wrap({ kind: 'implicit', f: function (x, y) { return x - cx2.fn(x, y, 0); }, params: mix([cx2]) });
			}
			if (L === 'r') {
				var cp = compile(R, env);
				if (cp.used.x || cp.used.y) throw new Error('Polar: write r in terms of θ, e.g. r = 2 + cos(θ)');
				return wrap({ kind: 'polar', r: function (t) { return cp.fn(0, 0, t); }, params: mix([cp]) });
			}
			if (/^[A-Za-z]$/.test(L) && !/^[xyteE]$/.test(L)) {
				var cv = compile(R, env);
				if (!usesAny(cv)) return { kind: 'param', name: L, value: cv.fn(0, 0, 0), params: mix([cv]) };
			}
			var a = compile(L, env), b = compile(R, env);
			return wrap({ kind: 'implicit', f: function (x, y) { return a.fn(x, y, 0) - b.fn(x, y, 0); }, params: mix([a, b]) });
		}
		// inequalities (one or a chain like 0<=x<=5)
		if (rel.some(function (r) { return r.op === '='; })) throw new Error('Use either = or inequality signs, not both');
		if (rel.length > 2) throw new Error('At most two inequality signs in a row');
		var ch = chainParts(src), cs = ch.parts.map(function (p) { return compile(p, env); }), tests = [], bounds = [], strict = true;
		for (var k = 0; k < ch.ops.length; k++) {
			var op = ch.ops[k]; if (op.length === 2) strict = false;
			(function (a, b, op) {
				bounds.push(function (x, y) { return a.fn(x, y, 0) - b.fn(x, y, 0); });
				tests.push(function (x, y) { var v = a.fn(x, y, 0) - b.fn(x, y, 0); return op === '<' ? v < 0 : op === '>' ? v > 0 : op === '<=' ? v <= 1e-12 : v >= -1e-12; });
			})(cs[k], cs[k + 1], op);
		}
		if (!cs.some(usesAny)) throw new Error('Use x and/or y in an inequality');
		return wrap({ kind: 'ineq', test: function (x, y) { for (var q = 0; q < tests.length; q++) if (!tests[q](x, y)) return false; return true; }, bounds: bounds, strict: strict, params: mix(cs) });
	}

	/* ---------- numerics ---------- */
	function fmtn(v) {
		if (!isFinite(v)) return v !== v ? 'undefined' : (v > 0 ? '∞' : '-∞');
		if (Math.abs(v) < 1e-10) return '0';
		return parseFloat(v.toPrecision(7)).toString().replace('e+', 'e');
	}
	function niceStep(raw) {
		var p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
		return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
	}
	function bisect(f, a, b, fa, fb) {
		for (var i = 0; i < 60; i++) { var m = (a + b) / 2, fm = f(m); if (fm === 0 || fm !== fm) return m; if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else { b = m; fb = fm; } }
		return (a + b) / 2;
	}
	function zeros(f, x0, x1, n) {
		var out = [], px = x0, py = f(px);
		for (var i = 1; i <= n; i++) {
			var x = x0 + (x1 - x0) * i / n, y = f(x);
			if (isFinite(py) && isFinite(y)) {
				if (py === 0) out.push(px);
				else if (py * y < 0) {
					var r = bisect(f, px, x, py, y), fr = f(r);
					if (isFinite(fr) && Math.abs(fr) <= Math.max(Math.abs(py), Math.abs(y)) * 0.5 + 1e-9) out.push(r);   // rejects asymptotes (1/x)
				}
			}
			px = x; py = y;
		}
		if (isFinite(py) && py === 0 && out[out.length - 1] !== px) out.push(px);
		return out.filter(function (r, i, a) { return i === 0 || Math.abs(r - a[i - 1]) > 1e-9 * (1 + Math.abs(r)); });
	}
	function extrema(f, x0, x1, n) {
		var xs = [], ys = [], out = [], i;
		for (i = 0; i <= n; i++) { xs.push(x0 + (x1 - x0) * i / n); ys.push(f(xs[i])); }
		for (i = 1; i < n; i++) {
			var a = ys[i - 1], b = ys[i], c = ys[i + 1];
			if (!isFinite(a) || !isFinite(b) || !isFinite(c)) continue;
			var d1 = b - a, d2 = c - b;
			if (!(d1 * d2 < 0) && !(d1 === 0 && d2 !== 0 && false)) continue;
			var isMax = d1 > 0, lo = xs[i - 1], hi = xs[i + 1];
			for (var k = 0; k < 70; k++) {
				var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3, f1 = f(m1), f2 = f(m2);
				if (isMax ? f1 < f2 : f1 > f2) lo = m1; else hi = m2;
			}
			var xm = (lo + hi) / 2, ym = f(xm), eps = (x1 - x0) / n * 1e-3;
			if (!isFinite(ym) || Math.abs(ym) > 1e7) continue;
			if (Math.abs(f(xm + eps) - ym) > 1e-3 * (1 + Math.abs(ym)) || Math.abs(f(xm - eps) - ym) > 1e-3 * (1 + Math.abs(ym))) continue;   // jump, not a turning point
			if (out.length && Math.abs(out[out.length - 1].x - xm) < 1e-9) continue;
			out.push({ type: isMax ? 'Maximum' : 'Minimum', x: xm, y: ym });
		}
		return out;
	}
	function keyPoints(f, others, x0, x1, n) {
		var pts = [];
		zeros(f, x0, x1, n).slice(0, 30).forEach(function (x) { pts.push({ type: 'Zero (x-intercept)', x: x, y: 0 }); });
		if (x0 <= 0 && x1 >= 0) { var y0 = f(0); if (isFinite(y0)) pts.push({ type: 'y-intercept', x: 0, y: y0 }); }
		extrema(f, x0, x1, n).slice(0, 30).forEach(function (p) { pts.push(p); });
		others.forEach(function (o) {
			zeros(function (x) { return f(x) - o.f(x); }, x0, x1, n).slice(0, 20).forEach(function (x) { pts.push({ type: 'Intersection' + (o.label ? ' with ' + o.label : ''), x: x, y: f(x) }); });
		});
		return pts;
	}

	return { makeM: makeM, analyze: analyze, compile: compile, fmtn: fmtn, niceStep: niceStep, keyPoints: keyPoints, zeros: zeros, extrema: extrema };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GC;

/* MES 2D Graphing Calculator UI (compiler + numerics are in lib.js, prepended above as GC) */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-graph2d:v1';
	var PALETTE = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#1b1b1b', '#e0409a', '#00968a'];
	var EXAMPLES = [
		['Parabola', ['y = x^2 - 2']],
		['Sine wave with sliders', ['a = 1', 'b = 1', 'y = a sin(b x)']],
		['Quadratic: vertex form', ['a = 1', 'h = 0', 'k = 0', 'y = a(x - h)^2 + k']],
		['Circle and line', ['x^2 + y^2 = 9', 'y = x + 1']],
		['Ellipse', ['x^2/9 + y^2/4 = 1']],
		['Floor and ceiling', ['y = ⌊x⌋', 'y = ⌈x⌉']],
		['Absolute value', ['y = |x - 2| - 1']],
		['Tangent', ['y = tan(x)']],
		['Cubic with roots', ['y = x^3 - 3x + 1']],
		['Exponential and log', ['y = e^x', 'y = ln(x)', 'y = x']],
		['Normal curve', ['y = e^(-x^2/2)/sqrt(2π)']],
		['Piecewise', ['y = x^2 {x<0}', 'y = x {x>=0}']],
		['Inequality region', ['y > x^2 - 2', 'y < 3']],
		['Heart', ['(x^2 + y^2 - 1)^3 = x^2 y^3']],
		['Parametric: circle', ['(2cos(t), 2sin(t))']],
		['Lissajous figure', ['(sin(3t), sin(2t))']],
		['Polar rose', ['k = 3', 'r = 3cos(kθ)']],
		['Spiral', ['r = θ/2 {0<=θ<=6π}']]
	];
	var DEFAULT_ROWS = ['y = x^2 - 2', 'a = 1', 'y = a sin(x)'];

	var rows = [], nextId = 1, activeId = null, view = { cx: 0, cy: 0, sx: 40, sy: 40 }, deg = false;
	var P = {}, pmeta = {}, F = {}, M = GC.makeM(), env = { P: P, F: F, M: M, userFns: {} };
	var toastTimer;
	function toast(msg) { var t = $('gc-toast'); t.textContent = msg; t.classList.add('tu-toast--show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 1500); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
		function fallback() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta); }
	}
	function isDark() { return document.body.classList.contains('dark-mode'); }

	/* ---------- state: rows, URL, localStorage ---------- */
	function pickColor() { var used = rows.map(function (r) { return r.color; }); for (var i = 0; i < PALETTE.length; i++) if (used.indexOf(PALETTE[i]) < 0) return PALETTE[i]; return PALETTE[rows.length % PALETTE.length]; }
	function addRow(text, color, show) { var r = { id: nextId++, text: text || '', color: color || pickColor(), show: show !== false, desc: null, err: '' }; rows.push(r); return r; }
	function snapshot() {
		var pm = {}; Object.keys(pmeta).forEach(function (k) { pm[k] = [P[k], pmeta[k].min, pmeta[k].max]; });
		return { r: rows.map(function (r) { return [r.text, r.color, r.show ? 1 : 0]; }), v: [view.cx, view.cy, view.sx, view.sy], d: deg ? 1 : 0, p: pm };
	}
	function restore(s) {
		rows = []; (s.r || []).forEach(function (a) { addRow(a[0], a[1], a[2] !== 0); });
		if (s.v && s.v.every(isFinite)) view = { cx: s.v[0], cy: s.v[1], sx: s.v[2], sy: s.v[3] };
		deg = !!s.d; M.deg = deg;
		Object.keys(s.p || {}).forEach(function (k) { P[k] = s.p[k][0]; pmeta[k] = { min: s.p[k][1], max: s.p[k][2], play: false }; });
	}
	function encode(s) { try { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))); } catch (e) { return ''; } }
	function decode(t) { try { return JSON.parse(decodeURIComponent(escape(atob(t)))); } catch (e) { return null; } }
	var saveTimer;
	function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) {} }, 400); }

	/* ---------- compile every row ---------- */
	var paramOrder = [];
	function compileAll() {
		env.userFns = {};
		Object.keys(F).forEach(function (k) { delete F[k]; });
		rows.forEach(function (r) { var m = /^\s*([A-Za-z])\s*\(\s*[A-Za-z]\s*\)\s*=/.exec(r.text); if (m) { env.userFns[m[1]] = true; F[m[1]] = function () { return NaN; }; } });
		var defined = {}, used = [];
		rows.forEach(function (r) {
			r.err = ''; r.desc = null;
			try {
				r.desc = GC.analyze(r.text, env);
				if (r.desc.kind === 'param') { defined[r.desc.name] = r.id; if (isFinite(r.desc.value)) P[r.desc.name] = r.desc.value; }
				r.desc.params.forEach(function (n) { if (used.indexOf(n) < 0) used.push(n); });
			} catch (e) { r.err = e.message || 'Cannot read this'; r.desc = { kind: 'error', params: [] }; }
		});
		paramOrder = [];
		Object.keys(defined).forEach(function (n) { if (paramOrder.indexOf(n) < 0) paramOrder.push(n); });
		used.forEach(function (n) { if (paramOrder.indexOf(n) < 0) paramOrder.push(n); });
		paramOrder.forEach(function (n) {
			if (!isFinite(P[n])) P[n] = 1;
			if (!pmeta[n]) pmeta[n] = { min: -10, max: 10, play: false };
			var v = P[n]; if (v < pmeta[n].min) pmeta[n].min = Math.floor(v - 1); if (v > pmeta[n].max) pmeta[n].max = Math.ceil(v + 1);
		});
		paramOrder.forEach(function (n) { pmeta[n].row = defined[n] || 0; });
		Object.keys(pmeta).forEach(function (n) { if (paramOrder.indexOf(n) < 0) { pmeta[n].play = false; } });
	}
	function rng(d, v) { var lo = d.tRange && d.tRange.lo != null ? d.tRange.lo : 0, hi = d.tRange && d.tRange.hi != null ? d.tRange.hi : 2 * Math.PI; return '[' + (lo === 0 ? '0' : GC.fmtn(lo)) + ', ' + (hi === 2 * Math.PI ? '2π' : GC.fmtn(hi)) + ']'; }
	function describe(r) {
		if (r.err) return r.err;
		var d = r.desc; if (!d) return '';
		return ({ empty: '', func: d.def ? 'function ' + d.def + '(x)' : 'function', xfunc: 'x as a function of y', implicit: 'curve', ineq: 'region', parametric: 'parametric curve, t ∈ ' + rng(d, 't'),
			polar: 'polar curve, θ ∈ ' + rng(d, 'θ'), point: '(' + GC.fmtn(d.x) + ', ' + GC.fmtn(d.y) + ')', param: 'slider ' + d.name + ' = ' + GC.fmtn(d.value) })[d.kind] || '';
	}

	/* ---------- rows UI ---------- */
	var lastInput = null;
	function renderRows() {
		var box = $('gc-rows'); box.innerHTML = '';
		rows.forEach(function (r) {
			var el = document.createElement('div'); el.className = 'gc-row' + (r.id === activeId ? ' is-active' : ''); el.dataset.id = r.id;
			el.innerHTML = '<input type="color" class="gc-color" aria-label="Colour" value="' + r.color + '">' +
				'<div class="gc-rowmain"><input class="gc-in" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="y = x^2" aria-label="Expression"><div class="gc-msg"></div></div>' +
				'<button type="button" class="gc-ibtn gc-eye" aria-label="Show or hide" aria-pressed="' + r.show + '" title="Show / hide">◉</button>' +
				'<button type="button" class="gc-ibtn gc-del" aria-label="Delete" title="Delete">✕</button>';
			el.querySelector('.gc-in').value = r.text;
			box.appendChild(el); updateMsg(r);
		});
	}
	function rowEl(r) { return $('gc-rows').querySelector('[data-id="' + r.id + '"]'); }
	function updateMsg(r) { var el = rowEl(r); if (!el) return; var m = el.querySelector('.gc-msg'); m.textContent = describe(r); m.className = 'gc-msg' + (r.err ? ' is-err' : ''); }
	function rowById(id) { for (var i = 0; i < rows.length; i++) if (rows[i].id === +id) return rows[i]; return null; }
	function setActive(id) { activeId = id; Array.prototype.forEach.call($('gc-rows').children, function (el) { el.classList.toggle('is-active', +el.dataset.id === id); }); scheduleKeys(); }
	var boxRows = $('gc-rows');
	boxRows.addEventListener('input', function (e) {
		var el = e.target.closest('.gc-row'); if (!el) return; var r = rowById(el.dataset.id);
		if (e.target.classList.contains('gc-in')) { r.text = e.target.value; changed(); }
		else if (e.target.classList.contains('gc-color')) { r.color = e.target.value; draw(); saveSoon(); }
	});
	boxRows.addEventListener('focusin', function (e) { var el = e.target.closest('.gc-row'); if (!el) return; if (e.target.classList.contains('gc-in')) lastInput = e.target; setActive(+el.dataset.id); });
	boxRows.addEventListener('click', function (e) {
		var el = e.target.closest('.gc-row'); if (!el) return; var r = rowById(el.dataset.id);
		if (e.target.closest('.gc-eye')) { r.show = !r.show; e.target.closest('.gc-eye').setAttribute('aria-pressed', String(r.show)); draw(); scheduleKeys(); saveSoon(); }
		else if (e.target.closest('.gc-del')) {
			rows = rows.filter(function (x) { return x !== r; }); if (!rows.length) addRow('');
			if (activeId === r.id) activeId = rows[rows.length - 1].id;
			renderRows(); changed(true);
		}
	});
	boxRows.addEventListener('keydown', function (e) {
		if (e.key === 'Enter' && e.target.classList.contains('gc-in')) {
			e.preventDefault(); var el = e.target.closest('.gc-row'), r = rowById(el.dataset.id), idx = rows.indexOf(r);
			var nr = addRow(''); rows.splice(rows.length - 1, 1); rows.splice(idx + 1, 0, nr); renderRows(); changed(true);
			var inp = rowEl(nr).querySelector('.gc-in'); inp.focus();
		}
	});
	$('gc-add').addEventListener('click', function () { var r = addRow(''); renderRows(); changed(true); rowEl(r).querySelector('.gc-in').focus(); });
	$('gc-clear').addEventListener('click', function () { rows = []; Object.keys(P).forEach(function (k) { delete P[k]; }); pmeta = {}; var r = addRow(''); activeId = r.id; renderRows(); changed(true); rowEl(r).querySelector('.gc-in').focus(); });
	var ex = $('gc-examples'); ex.innerHTML = '<option value="">Examples…</option>' + EXAMPLES.map(function (e, i) { return '<option value="' + i + '">' + e[0] + '</option>'; }).join('');
	ex.addEventListener('change', function () {
		if (ex.value === '') return; var e = EXAMPLES[+ex.value]; ex.value = '';
		rows = []; Object.keys(P).forEach(function (k) { delete P[k]; }); pmeta = {};
		e[1].forEach(function (t) { addRow(t); }); activeId = rows[rows.length - 1].id; renderRows(); homeView(); changed(true);
	});
	$('gc-keys').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
	$('gc-keys').addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b) return;
		var inp = lastInput && document.body.contains(lastInput) ? lastInput : $('gc-rows').querySelector('.gc-in'); if (!inp) return;
		var s = b.dataset.ins, caret = s.indexOf('§'); s = s.replace('§', '');
		var a = inp.selectionStart == null ? inp.value.length : inp.selectionStart, z = inp.selectionEnd == null ? a : inp.selectionEnd;
		inp.value = inp.value.slice(0, a) + s + inp.value.slice(z);
		var p = a + (caret >= 0 ? caret : s.length); inp.focus(); try { inp.setSelectionRange(p, p); } catch (e2) {}
		inp.dispatchEvent(new Event('input', { bubbles: true }));
	});

	/* ---------- sliders ---------- */
	var shownParams = '';
	function renderParams(force) {
		var sig = paramOrder.join(','); if (!force && sig === shownParams) { refreshParamValues(); return; }
		shownParams = sig; var box = $('gc-params');
		if (!paramOrder.length) { box.innerHTML = ''; return; }
		box.innerHTML = '<h3>Sliders</h3>' + paramOrder.map(function (n) {
			var m = pmeta[n];
			return '<div class="gc-param" data-n="' + n + '"><b>' + n + '</b><input type="range" min="' + m.min + '" max="' + m.max + '" step="any" value="' + P[n] + '" aria-label="Value of ' + n + '">' +
				'<input class="gc-num" type="text" inputmode="decimal" value="' + GC.fmtn(P[n]) + '" aria-label="' + n + ' value"><button type="button" class="gc-ibtn gc-play" aria-pressed="' + !!m.play + '" title="Animate" aria-label="Animate ' + n + '">▶</button>' +
				'<div class="gc-lim"><span>min <input class="gc-min" type="text" inputmode="decimal" value="' + m.min + '"></span><span>max <input class="gc-max" type="text" inputmode="decimal" value="' + m.max + '"></span></div></div>';
		}).join('');
	}
	function refreshParamValues() {
		Array.prototype.forEach.call($('gc-params').querySelectorAll('.gc-param'), function (el) {
			var n = el.dataset.n; if (document.activeElement === el.querySelector('.gc-num')) return;
			el.querySelector('input[type=range]').value = P[n]; el.querySelector('.gc-num').value = GC.fmtn(P[n]);
		});
	}
	function setParam(n, v, fromRow) {
		P[n] = v; var m = pmeta[n];
		if (m && m.row && !fromRow) { var r = rowById(m.row); if (r) { r.text = n + ' = ' + GC.fmtn(v); var inp = rowEl(r) && rowEl(r).querySelector('.gc-in'); if (inp && document.activeElement !== inp) inp.value = r.text; r.desc.value = v; updateMsg(r); } }
		draw(); scheduleKeys(); saveSoon();
	}
	$('gc-params').addEventListener('input', function (e) {
		var el = e.target.closest('.gc-param'); if (!el) return; var n = el.dataset.n, m = pmeta[n];
		if (e.target.type === 'range') { var v = parseFloat(e.target.value); el.querySelector('.gc-num').value = GC.fmtn(v); setParam(n, v); }
		else if (e.target.classList.contains('gc-num')) { var v2 = parseFloat(e.target.value); if (isFinite(v2)) { if (v2 < m.min) m.min = v2; if (v2 > m.max) m.max = v2; var rg = el.querySelector('input[type=range]'); rg.min = m.min; rg.max = m.max; rg.value = v2; setParam(n, v2); } }
		else if (e.target.classList.contains('gc-min') || e.target.classList.contains('gc-max')) {
			var lo = parseFloat(el.querySelector('.gc-min').value), hi = parseFloat(el.querySelector('.gc-max').value);
			if (isFinite(lo) && isFinite(hi) && lo < hi) { m.min = lo; m.max = hi; var rg2 = el.querySelector('input[type=range]'); rg2.min = lo; rg2.max = hi; saveSoon(); }
		}
	});
	$('gc-params').addEventListener('click', function (e) {
		var b = e.target.closest('.gc-play'); if (!b) return; var n = b.closest('.gc-param').dataset.n; pmeta[n].play = !pmeta[n].play; b.setAttribute('aria-pressed', String(pmeta[n].play)); b.textContent = pmeta[n].play ? '❚❚' : '▶'; if (pmeta[n].play) startAnim();
	});
	var animOn = false, lastT = 0, dir = {};
	function startAnim() { if (animOn) return; animOn = true; lastT = performance.now(); requestAnimationFrame(tick); }
	function tick(now) {
		var dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; var any = false;
		paramOrder.forEach(function (n) {
			var m = pmeta[n]; if (!m.play) return; any = true;
			var d = dir[n] || 1, span = m.max - m.min, v = P[n] + d * span / 6 * dt;
			if (v > m.max) { v = m.max; dir[n] = -1; } else if (v < m.min) { v = m.min; dir[n] = 1; }
			setParam(n, v);
		});
		refreshParamValues();
		if (any) requestAnimationFrame(tick); else animOn = false;
	}

	/* ---------- canvas / view ---------- */
	var canvas = $('gc-canvas'), stage = $('gc-stage'), ctx = canvas.getContext('2d'), W = 0, H = 0, dpr = 1;
	function resize() {
		var r = stage.getBoundingClientRect(); var nw = Math.max(50, Math.round(r.width)), nh = Math.max(50, Math.round(r.height));
		dpr = Math.min(3, window.devicePixelRatio || 1);
		if (nw === W && nh === H && canvas.width === Math.round(W * dpr)) return;
		if (W && !firstHome) { var f = nw / W; /* keep the scale when the stage is resized */ } W = nw; H = nh;
		canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); draw();
	}
	var firstHome = true;
	function homeView() { view = { cx: 0, cy: 0, sx: Math.max(10, Math.min(W || 800, 900) / 20), sy: 0 }; view.sy = view.sx; draw(); saveSoon(); scheduleKeys(); }
	function wx(px) { return view.cx + (px - W / 2) / view.sx; }
	function wy(py) { return view.cy - (py - H / 2) / view.sy; }
	function px(x) { return W / 2 + (x - view.cx) * view.sx; }
	function py(y) { return H / 2 - (y - view.cy) * view.sy; }
	function colors() {
		return isDark() ? { bg: '#161618', minor: '#242428', major: '#37373d', axis: '#9a9aa2', text: '#b8b8c0', ink: '#e8e8ea' } : { bg: '#ffffff', minor: '#eef0f3', major: '#d4d8de', axis: '#4a5160', text: '#4a5160', ink: '#1b1b1b' };
	}
	function inkColor(c) { return isDark() && (c === '#1b1b1b' || c === '#000000') ? '#e8e8ea' : c; }
	var needDraw = false, moving = false;
	function draw() { if (needDraw) return; needDraw = true; requestAnimationFrame(function () { needDraw = false; render(); }); }
	var markers = [], keyRows = [];

	function drawGrid(c) {
		ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
		var stepX = GC.niceStep(90 / view.sx), stepY = GC.niceStep(90 / view.sy);
		function lines(step, scale, horizontal) {
			var lo = horizontal ? wy(H) : wx(0), hi = horizontal ? wy(0) : wx(W);
			var minor = step / 5, i0 = Math.floor(lo / minor), i1 = Math.ceil(hi / minor);
			for (var pass = 0; pass < 2; pass++) {
				ctx.beginPath(); ctx.strokeStyle = pass ? c.major : c.minor; ctx.lineWidth = 1;
				for (var i = i0; i <= i1; i++) {
					var isMajor = i % 5 === 0; if ((pass === 1) !== isMajor) continue;
					if (!isMajor && minor * scale < 8) continue;
					var v = i * minor, p = Math.round(horizontal ? py(v) : px(v)) + 0.5;
					if (horizontal) { ctx.moveTo(0, p); ctx.lineTo(W, p); } else { ctx.moveTo(p, 0); ctx.lineTo(p, H); }
				}
				ctx.stroke();
			}
		}
		lines(stepX, view.sx, false); lines(stepY, view.sy, true);
		// axes
		var ax = px(0), ay = py(0);
		ctx.strokeStyle = c.axis; ctx.lineWidth = 1.5; ctx.beginPath();
		if (ay >= 0 && ay <= H) { ctx.moveTo(0, ay); ctx.lineTo(W, ay); }
		if (ax >= 0 && ax <= W) { ctx.moveTo(ax, 0); ctx.lineTo(ax, H); }
		ctx.stroke();
		// labels
		ctx.fillStyle = c.text; ctx.font = '12px system-ui, sans-serif';
		var lx = Math.min(Math.max(ax, 4), W - 4), ly = Math.min(Math.max(ay, 14), H - 6);
		ctx.textAlign = 'center'; ctx.textBaseline = 'top';
		var ty = Math.min(Math.max(ay + 4, 2), H - 16);
		for (var i = Math.ceil(wx(0) / stepX); i <= Math.floor(wx(W) / stepX); i++) { if (i === 0) continue; var xx = px(i * stepX); ctx.fillText(GC.fmtn(i * stepX), xx, ty); }
		ctx.textAlign = ax < 40 ? 'left' : 'right'; ctx.textBaseline = 'middle';
		var tx = ax < 40 ? Math.max(ax, 0) + 6 : Math.min(ax, W) - 6;
		for (var j = Math.ceil(wy(H) / stepY); j <= Math.floor(wy(0) / stepY); j++) { if (j === 0) continue; var yy = py(j * stepY); ctx.fillText(GC.fmtn(j * stepY), tx, yy); }
		if (ax >= 0 && ax <= W && ay >= 0 && ay <= H) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('0', ax - 5, ay + 4); }
	}

	// y = f(x) with refinement so steep parts stay connected but real jumps (floor, tan) are broken
	function plotFunc(d, color) {
		ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
		var pen = false, lastX = 0, lastY = NaN;
		function val(x) { var y = d.f(x); if (d.cond && !d.cond(x, y, 0)) return NaN; return y; }
		function pyOf(y) { var p = py(y); return isFinite(p) && Math.abs(p) < 1e5 ? p : NaN; }
		function seg(x0, p0, x1, p1, depth) {
			if (p0 !== p0 || p1 !== p1) return false;
			if (Math.abs(p1 - p0) <= 2) return true;
			if (depth === 0) return Math.abs(p1 - p0) < 12;
			var xm = (x0 + x1) / 2, pm = pyOf(val(xm));
			if (pm !== pm) return false;
			return seg(x0, p0, xm, pm, depth - 1) && seg(xm, pm, x1, p1, depth - 1);
		}
		var step = moving ? 2 : 1;
		for (var p = 0; p <= W + step; p += step) {
			var x = wx(p), pp = pyOf(val(x));
			if (pp !== pp) { pen = false; lastY = NaN; continue; }
			if (pen && lastY === lastY) {
				if (seg(lastX, lastY, x, pp, moving ? 0 : 7)) ctx.lineTo(p, pp);
				else { ctx.moveTo(p, pp); }
			} else ctx.moveTo(p, pp);
			pen = true; lastX = x; lastY = pp;
		}
		ctx.stroke();
	}
	function plotXFunc(d, color) {
		ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); var pen = false;
		for (var p = 0; p <= H + 1; p += 1) {
			var y = wy(p), x = d.f(y); if (d.cond && !d.cond(x, y, 0)) x = NaN;
			var q = px(x); if (!isFinite(q) || Math.abs(q) > 1e5) { pen = false; continue; }
			if (pen) ctx.lineTo(q, p); else ctx.moveTo(q, p); pen = true;
		}
		ctx.stroke();
	}
	function plotParam(d, color, polar) {
		var lo = d.tRange && d.tRange.lo != null ? d.tRange.lo : 0, hi = d.tRange && d.tRange.hi != null ? d.tRange.hi : 2 * Math.PI;
		if (!(hi > lo)) return;
		var n = moving ? 800 : 4000; ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath(); var pen = false;
		for (var i = 0; i <= n; i++) {
			var t = lo + (hi - lo) * i / n, X, Y;
			if (polar) { var r = d.r(t); X = r * Math.cos(t); Y = r * Math.sin(t); } else { X = d.fx(0, 0, t); Y = d.fy(0, 0, t); }
			if (d.cond && !d.cond(X, Y, t)) { pen = false; continue; }
			var a = px(X), b = py(Y); if (!isFinite(a) || !isFinite(b) || Math.abs(a) > 1e5 || Math.abs(b) > 1e5) { pen = false; continue; }
			if (pen) ctx.lineTo(a, b); else ctx.moveTo(a, b); pen = true;
		}
		ctx.stroke();
	}
	// implicit curve f(x,y)=0 by marching squares
	function gridValues(fn, cs, cond) {
		var nx = Math.ceil(W / cs) + 1, ny = Math.ceil(H / cs) + 1, v = new Float64Array(nx * ny);
		for (var j = 0; j < ny; j++) { var y = wy(j * cs); for (var i = 0; i < nx; i++) { var x = wx(i * cs), q = fn(x, y); if (cond && !cond(x, y, 0)) q = NaN; v[j * nx + i] = q; } }
		return { v: v, nx: nx, ny: ny };
	}
	function marching(fn, color, cond, dashed) {
		var cs = moving ? 6 : 3, g = gridValues(fn, cs, cond), v = g.v, nx = g.nx, ny = g.ny;
		ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath();
		if (dashed) ctx.setLineDash([7, 5]);
		function lerp(a, b, fa, fb) { var t = fa / (fa - fb); return a + (b - a) * t; }
		for (var j = 0; j < ny - 1; j++) for (var i = 0; i < nx - 1; i++) {
			var a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
			if (a !== a || b !== b || c !== c || d !== d) continue;
			var idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
			if (idx === 0 || idx === 15) continue;
			if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) > 1e8) continue;
			var x0 = i * cs, y0 = j * cs, x1 = x0 + cs, y1 = y0 + cs;
			var T = [lerp(x0, x1, a, b), y0], R = [x1, lerp(y0, y1, b, c)], B = [lerp(x0, x1, d, c), y1], L = [x0, lerp(y0, y1, a, d)];
			var segs;
			switch (idx) {
				case 1: case 14: segs = [[L, B]]; break; case 2: case 13: segs = [[B, R]]; break; case 3: case 12: segs = [[L, R]]; break;
				case 4: case 11: segs = [[T, R]]; break; case 6: case 9: segs = [[T, B]]; break; case 7: case 8: segs = [[L, T]]; break;
				case 5: segs = [[L, T], [B, R]]; break; case 10: segs = [[L, B], [T, R]]; break;
			}
			segs.forEach(function (s) { ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); });
		}
		ctx.stroke(); ctx.setLineDash([]);
	}
	var shade = document.createElement('canvas');
	function plotIneq(d, color) {
		var cs = moving ? 4 : 2, w = Math.ceil(W / cs), h = Math.ceil(H / cs); shade.width = w; shade.height = h;
		var sctx = shade.getContext('2d'), img = sctx.createImageData(w, h), data = img.data, rgb = parseInt(color.slice(1), 16), R = rgb >> 16 & 255, G = rgb >> 8 & 255, B = rgb & 255;
		for (var j = 0; j < h; j++) { var y = wy(j * cs); for (var i = 0; i < w; i++) { var x = wx(i * cs); var ok = d.test(x, y); if (ok && d.cond && !d.cond(x, y, 0)) ok = false; if (ok) { var k = (j * w + i) * 4; data[k] = R; data[k + 1] = G; data[k + 2] = B; data[k + 3] = 70; } } }
		sctx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(shade, 0, 0, w * cs, h * cs); ctx.imageSmoothingEnabled = true;
		d.bounds.forEach(function (b) { marching(b, color, null, d.strict); });
	}
	function plotPoint(d, color, c) {
		var a = px(d.x), b = py(d.y); if (!isFinite(a) || !isFinite(b)) return;
		ctx.fillStyle = color; ctx.beginPath(); ctx.arc(a, b, 5.5, 0, 6.2832); ctx.fill();
		ctx.fillStyle = c.ink; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('(' + GC.fmtn(d.x) + ', ' + GC.fmtn(d.y) + ')', a + 8, b - 6);
	}

	function render() {
		if (!W) return; var c = colors();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
		drawGrid(c);
		rows.forEach(function (r) {
			if (!r.show || !r.desc) return; var d = r.desc, col = inkColor(r.color);
			try {
				if (d.kind === 'func') plotFunc(d, col); else if (d.kind === 'xfunc') plotXFunc(d, col);
				else if (d.kind === 'parametric') plotParam(d, col, false); else if (d.kind === 'polar') plotParam(d, col, true);
				else if (d.kind === 'implicit') marching(d.f, col, d.cond, false); else if (d.kind === 'ineq') plotIneq(d, col); else if (d.kind === 'point') plotPoint(d, col, c);
			} catch (e) { /* a row that throws at draw time just does not draw */ }
		});
		// key point markers + trace dot
		markers.forEach(function (m) { var a = px(m.x), b = py(m.y); if (a < -10 || a > W + 10 || b < -10 || b > H + 10) return; ctx.beginPath(); ctx.arc(a, b, 5, 0, 6.2832); ctx.fillStyle = c.bg; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = inkColor(m.color); ctx.stroke(); });
		if (trace) { ctx.beginPath(); ctx.arc(px(trace.x), py(trace.y), 4.5, 0, 6.2832); ctx.fillStyle = inkColor(trace.color); ctx.fill(); }
	}

	/* ---------- key points ---------- */
	var keyTimer;
	function scheduleKeys() { clearTimeout(keyTimer); keyTimer = setTimeout(computeKeys, 140); }
	function computeKeys() {
		markers = []; var r = rowById(activeId), card = $('gc-kp');
		if (!r || !r.desc || r.desc.kind !== 'func' || !r.show || r.err) { card.hidden = true; draw(); return; }
		var others = rows.filter(function (o) { return o !== r && o.show && o.desc && o.desc.kind === 'func' && !o.err; }).map(function (o) { return { f: o.desc.f, label: 'row ' + (rows.indexOf(o) + 1) }; });
		var f = r.desc.f; if (r.desc.cond) { var raw = f, cd = r.desc.cond; f = function (x) { var y = raw(x); return cd(x, y, 0) ? y : NaN; }; others = others.map(function (o) { return o; }); }
		var pts = [];
		try { pts = GC.keyPoints(f, others, wx(0), wx(W), Math.min(2400, W * 2)); } catch (e) {}
		pts = pts.slice(0, 40); pts.forEach(function (p) { p.color = r.color; markers.push(p); });
		var tb = $('gc-kp-table').querySelector('tbody');
		tb.innerHTML = pts.length ? pts.map(function (p) { return '<tr><td>' + p.type + '</td><td>' + GC.fmtn(p.x) + '</td><td>' + GC.fmtn(p.y) + '</td></tr>'; }).join('') : '<tr><td colspan="3" style="text-align:left;">No zeros, extremes or intersections in view.</td></tr>';
		$('gc-kp-name').textContent = r.text.trim().slice(0, 40); card.hidden = false; draw();
	}

	/* ---------- interaction ---------- */
	var trace = null, pointers = {}, drag = null, pinch = null, movingTimer;
	function setMoving() { moving = true; clearTimeout(movingTimer); movingTimer = setTimeout(function () { moving = false; draw(); scheduleKeys(); saveSoon(); }, 140); }
	function localPos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	function zoomAt(f, p, ax, ay) {
		var X = wx(p.x), Y = wy(p.y);
		if (ax !== false) { view.sx = Math.min(1e7, Math.max(1e-5, view.sx * f)); view.cx = X - (p.x - W / 2) / view.sx; }
		if (ay !== false) { view.sy = Math.min(1e7, Math.max(1e-5, view.sy * f)); view.cy = Y + (p.y - H / 2) / view.sy; }
		setMoving(); draw();
	}
	canvas.addEventListener('pointerdown', function (e) {
		canvas.setPointerCapture(e.pointerId); var p = localPos(e); pointers[e.pointerId] = p; canvas.focus({ preventScroll: true });
		var ids = Object.keys(pointers);
		if (ids.length === 1) drag = { x: p.x, y: p.y, cx: view.cx, cy: view.cy };
		else if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), sx: view.sx, sy: view.sy }; drag = null; }
	});
	canvas.addEventListener('pointermove', function (e) {
		var p = localPos(e);
		if (pointers[e.pointerId]) {
			pointers[e.pointerId] = p; var ids = Object.keys(pointers);
			if (ids.length === 2 && pinch) {
				var a = pointers[ids[0]], b = pointers[ids[1]], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, f = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d;
				var X = wx(mid.x), Y = wy(mid.y); view.sx = pinch.sx * f; view.sy = pinch.sy * f; view.cx = X - (mid.x - W / 2) / view.sx; view.cy = Y + (mid.y - H / 2) / view.sy; setMoving(); draw();
			} else if (drag) { view.cx = drag.cx - (p.x - drag.x) / view.sx; view.cy = drag.cy + (p.y - drag.y) / view.sy; setMoving(); draw(); }
			return;
		}
		hover(p);
	});
	function endPointer(e) { delete pointers[e.pointerId]; var ids = Object.keys(pointers); pinch = null; if (ids.length === 1) { var q = pointers[ids[0]]; drag = { x: q.x, y: q.y, cx: view.cx, cy: view.cy }; } else drag = null; }
	canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
	canvas.addEventListener('pointerleave', function () { trace = null; $('gc-tip').hidden = true; $('gc-readout').textContent = ''; draw(); });
	canvas.addEventListener('wheel', function (e) {
		e.preventDefault(); var f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)); zoomAt(f, localPos(e), e.altKey ? false : true, e.shiftKey ? false : true);
	}, { passive: false });
	canvas.addEventListener('dblclick', function (e) { zoomAt(1.6, localPos(e)); });
	canvas.addEventListener('keydown', function (e) {
		var k = e.key, step = 0.1;
		if (k === 'ArrowLeft') view.cx -= W * step / view.sx; else if (k === 'ArrowRight') view.cx += W * step / view.sx;
		else if (k === 'ArrowUp') view.cy += H * step / view.sy; else if (k === 'ArrowDown') view.cy -= H * step / view.sy;
		else if (k === '+' || k === '=') { zoomAt(1.25, { x: W / 2, y: H / 2 }); return; } else if (k === '-' || k === '_') { zoomAt(0.8, { x: W / 2, y: H / 2 }); return; }
		else if (k === '0') { homeView(); return; } else return;
		e.preventDefault(); setMoving(); draw();
	});
	function hover(p) {
		var x = wx(p.x), y = wy(p.y), txt = '(' + GC.fmtn(x) + ', ' + GC.fmtn(y) + ')';
		var r = rowById(activeId); trace = null;
		if (r && r.show && r.desc && r.desc.kind === 'func' && !r.err) { var fy = r.desc.f(x); if (r.desc.cond && !r.desc.cond(x, fy, 0)) fy = NaN; if (isFinite(fy)) { trace = { x: x, y: fy, color: r.color }; txt += '   f(x) = ' + GC.fmtn(fy); } }
		$('gc-readout').textContent = txt;
		var best = null, bd = 12;
		markers.forEach(function (m) { var d = Math.hypot(px(m.x) - p.x, py(m.y) - p.y); if (d < bd) { bd = d; best = m; } });
		var tip = $('gc-tip');
		if (best) { tip.hidden = false; tip.style.left = px(best.x) + 'px'; tip.style.top = py(best.y) + 'px'; tip.textContent = best.type + ': (' + GC.fmtn(best.x) + ', ' + GC.fmtn(best.y) + ')'; trace = null; } else tip.hidden = true;
		draw();
	}

	/* ---------- toolbar ---------- */
	$('gc-zin').addEventListener('click', function () { zoomAt(1.4, { x: W / 2, y: H / 2 }); });
	$('gc-zout').addEventListener('click', function () { zoomAt(1 / 1.4, { x: W / 2, y: H / 2 }); });
	$('gc-home').addEventListener('click', homeView);
	$('gc-sq').addEventListener('click', function () { view.sy = view.sx; draw(); saveSoon(); scheduleKeys(); });
	function setDeg() { M.deg = deg; $('gc-deg').textContent = deg ? 'Deg' : 'Rad'; $('gc-deg').setAttribute('aria-pressed', String(deg)); }
	$('gc-deg').addEventListener('click', function () { deg = !deg; setDeg(); draw(); scheduleKeys(); saveSoon(); });
	$('gc-png').addEventListener('click', function () {
		canvas.toBlob(function (b) { if (!b) return; var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mes-graph.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); });
	});
	$('gc-link').addEventListener('click', function () { copy(location.origin + location.pathname + '?s=' + encodeURIComponent(encode(snapshot())), 'Link copied'); });
	function paintTheatre() { $('gc-theatre').setAttribute('aria-pressed', String(document.documentElement.classList.contains('page-theatre'))); }
	$('gc-theatre').addEventListener('click', function () {
		var on = document.documentElement.classList.toggle('page-theatre');
		try { localStorage.setItem('pageMode', on ? 'theatre' : 'std'); localStorage.setItem('pageWide', on ? '1' : '0'); } catch (e) {}
		paintTheatre(); setTimeout(resize, 60);
	});
	paintTheatre();
	$('gc-full').addEventListener('click', function () { if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen(); });
	document.addEventListener('fullscreenchange', function () { setTimeout(resize, 50); });
	if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
	new MutationObserver(function () { draw(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	/* ---------- change pipeline ---------- */
	function changed(structure) {
		compileAll(); rows.forEach(updateMsg); renderParams(false); draw(); scheduleKeys(); saveSoon();
	}

	/* ---------- start-up ---------- */
	var q = new URLSearchParams(location.search), s = null;
	if (q.get('s')) s = decode(q.get('s'));
	else if (q.getAll('f').length) s = { r: q.getAll('f').map(function (t) { return [t.slice(0, 300)]; }) };
	else { try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; } }
	if (s && s.r && s.r.length) restore(s); else DEFAULT_ROWS.forEach(function (t) { addRow(t); });
	activeId = rows[0].id; setDeg();
	resize(); if (!(s && s.v)) homeView();
	firstHome = false; renderRows(); compileAll(); rows.forEach(updateMsg); renderParams(true); draw(); scheduleKeys();
})();
