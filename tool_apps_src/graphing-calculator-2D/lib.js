/* MES Graphing Calculator 2D -- expression compiler + numerics (no DOM), prepended to app.js by build_tool_apps.py.
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
