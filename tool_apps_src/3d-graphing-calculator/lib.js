/* MES 3D Graphing Calculator -- expression compiler + meshing (no DOM, no three.js), prepended to app.js by build_tool_apps.py.
 * Also runs in node: require() it to test. Same design as the 2D page's lib.js: user text is tokenised and parsed by our own
 * grammar and only whitelisted tokens ever reach the generated JavaScript (numbers, our own function table, the variables
 * x/y/z/u/v/t, P["a"] sliders, F["f"] user functions) -- no raw user text is executed.
 * Meshing works in *data* coordinates and returns plain arrays; app.js maps them into the three.js scene. */
var G3 = (function () {
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
		M.atan2 = function (y, x) { return ia(Math.atan2(y, x)); };
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
		sin: 'sin', cos: 'cos', tan: 'tan', sec: 'sec', csc: 'csc', cot: 'cot', asin: 'asin', arcsin: 'asin', acos: 'acos', arccos: 'acos', atan: 'atan', arctan: 'atan', atan2: 'atan2',
		sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', sqrt: 'sqrt', cbrt: 'cbrt', abs: 'abs', ln: 'ln', log: 'log', log2: 'log2', log10: 'log10', exp: 'exp',
		floor: 'floor', ceil: 'ceil', ceiling: 'ceil', round: 'round', trunc: 'trunc', sign: 'sign', sgn: 'sign', min: 'min', max: 'max', mod: 'mod', root: 'root', nthroot: 'root', fact: 'fact'
	};
	var CONSTS = { pi: Math.PI, 'π': Math.PI, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 };
	var BYLEN = Object.keys(FNAMES).concat(['theta', 'tau', 'phi', 'pi', 'π', 'θ']).sort(function (p, q) { return q.length - p.length; });
	var VARS = { x: 1, y: 1, z: 1, u: 1, v: 1, t: 1 };
	var ARGS = 'x,y,z,u,v,t';

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
			else if (VARS[c]) out.push({ k: 'var', v: c });
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
				if (w === 'log') { var lm = /^(10|2)(?=\()/.exec(rest); if (lm) { out.push({ k: 'fn', v: 'log' + lm[1] }); i += w.length + lm[1].length; continue; } }
				splitIdent(w, rest, env, out); i += w.length; continue;
			}
			if ('+-*/^(),|⌊⌋⌈⌉!'.indexOf(c) >= 0) { out.push({ k: 'op', v: c }); i++; continue; }
			throw new Error('Unexpected “' + c + '”');
		}
		return out;
	}

	/* ---------- parser -> JS source ---------- */
	function parse(t, env, alias) {
		var i = 0, abs = 0, used = { x: false, y: false, z: false, u: false, v: false, t: false, params: [] };
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
				if (alias && alias[x.v]) { used[alias[x.v]] = true; return alias[x.v]; }
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
	// every compiled function takes (x, y, z, u, v, t)
	function build(code, env) { return new Function('P', 'F', 'M', 'return function(' + ARGS + '){return ' + code + ';};')(env.P, env.F, env.M); }
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
			else if (c === '=' && str[i - 1] !== '<' && str[i - 1] !== '>') ops.push({ pos: i, len: 1, op: '=' });
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
	// "{x>0, z<3}" / "{0<=u<=2π, 0<=v<=π}" -> {test, ranges: {t|u|v: {lo, hi}}}
	function parseCond(str, env) {
		var tests = [], ranges = {};
		splitTop(str, ',').forEach(function (piece) {
			var ch = chainParts(piece);
			if (!ch.ops.length) throw new Error('A { } restriction needs a comparison like x>0 or 0<=t<=2π');
			var codes = ch.parts.map(function (p) { return parse(tokenize(p, env), env).code; });
			var chunks = [];
			for (var k = 0; k < ch.ops.length; k++) chunks.push(cmpCode(codes[k], ch.ops[k], codes[k + 1]));
			tests.push('(' + chunks.join('&&') + ')');
			var pv = function (p) { var m = /^\s*(t|u|v|θ|theta)\s*$/.exec(p); return m ? (m[1] === 'θ' || m[1] === 'theta' ? 't' : m[1]) : null; };
			var num = function (p) { var c = compile(p, env); if (c.used.x || c.used.y || c.used.z || c.used.u || c.used.v || c.used.t) throw 0; return c.fn(0, 0, 0, 0, 0, 0); };
			try {
				var n;
				if (ch.ops.length === 2 && (n = pv(ch.parts[1])) && ch.ops[0][0] === '<' && ch.ops[1][0] === '<') ranges[n] = { lo: num(ch.parts[0]), hi: num(ch.parts[2]) };
				else if (ch.ops.length === 2 && (n = pv(ch.parts[1])) && ch.ops[0][0] === '>' && ch.ops[1][0] === '>') ranges[n] = { lo: num(ch.parts[2]), hi: num(ch.parts[0]) };
				else if (ch.ops.length === 1 && (n = pv(ch.parts[0]))) {
					var r = ranges[n] || (ranges[n] = { lo: null, hi: null });
					if (ch.ops[0][0] === '<') r.hi = num(ch.parts[1]); else r.lo = num(ch.parts[1]);
				}
			} catch (e) { /* not constant limits: leave it as a plain condition */ }
		});
		return { test: build(tests.join('&&'), env), ranges: ranges };
	}
	function unwrapParens(s) {
		s = s.trim(); if (s[0] !== '(' || s[s.length - 1] !== ')') return null;
		var d = 0;
		for (var i = 0; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') { d--; if (d === 0 && i < s.length - 1) return null; } }
		return s.slice(1, -1);
	}
	function mix(list) { var p = []; list.forEach(function (c) { c.used.params.forEach(function (n) { if (p.indexOf(n) < 0) p.push(n); }); }); return p; }
	function any(list, names) { return list.some(function (c) { return names.split('').some(function (n) { return c.used[n]; }); }); }
	function range(ranges, n, lo, hi) { var r = ranges && ranges[n]; return { lo: r && r.lo != null && isFinite(r.lo) ? r.lo : lo, hi: r && r.hi != null && isFinite(r.hi) ? r.hi : hi }; }
	function constFn(v) { return function () { return v; }; }

	// surface "axis = f(other two)": f gets the two free coordinates in x,y,z order
	function surf(axis, c, cond) {
		var fn = c.fn, f;
		if (axis === 'z') f = function (a, b) { return fn(a, b, 0, 0, 0, 0); };
		else if (axis === 'x') f = function (a, b) { return fn(0, a, b, 0, 0, 0); };
		else f = function (a, b) { return fn(a, 0, b, 0, 0, 0); };
		return { kind: 'surface', axis: axis, f: f, cond: cond ? cond.test : null, params: mix([c]) };
	}

	// text -> {kind, ...}. env = {P, F, M, userFns}. Throws Error with a readable message.
	// kinds: empty | param | def | surface {axis, f(a,b)} | implicit {f(x,y,z)} | curve {fx,fy,fz,(t) range} | psurface {fx,fy,fz,(u,v) ranges} | point
	function analyze(text, env) {
		var src = String(text).trim();
		if (!src) return { kind: 'empty', params: [] };
		var cond = null, m = /\{([^{}]*)\}\s*$/.exec(src);
		if (m) { src = src.slice(0, m.index).trim(); cond = parseCond(m[1], env); if (!src) throw new Error('Put the restriction after an expression'); }
		var rel = findRel(src), rg = cond ? cond.ranges : {};
		var ctest = cond ? cond.test : null;

		if (!rel.length) {
			var inner = unwrapParens(src), parts = inner !== null ? splitTop(inner, ',') : null;
			if (parts && parts.length === 2) throw new Error('A 3D point needs three numbers: (x, y, z)');
			if (parts && parts.length === 3) {
				var cs = parts.map(function (p) { return compile(p, env); });
				if (any(cs, 'xyz')) throw new Error('Use t for a curve (cos t, sin t, t) or u and v for a surface');
				var F3 = cs.map(function (c) { return c.fn; });
				if (any(cs, 'uv')) {
					var ur = range(rg, 'u', 0, 2 * Math.PI), vr = range(rg, 'v', 0, 2 * Math.PI);
					return { kind: 'psurface', fx: F3[0], fy: F3[1], fz: F3[2], u: ur, v: vr, cond: ctest, params: mix(cs) };
				}
				if (any(cs, 't')) return { kind: 'curve', fx: F3[0], fy: F3[1], fz: F3[2], t: range(rg, 't', 0, 2 * Math.PI), cond: ctest, params: mix(cs) };
				return { kind: 'point', x: F3[0](0, 0, 0, 0, 0, 0), y: F3[1](0, 0, 0, 0, 0, 0), z: F3[2](0, 0, 0, 0, 0, 0), params: mix(cs) };
			}
			var c = compile(src, env);
			if (c.used.z) throw new Error('Add “= …” to make it an equation, e.g. x^2 + y^2 + z^2 = 9');
			if (c.used.u || c.used.v || c.used.t) throw new Error('t, u and v go inside ( , , ) for curves and surfaces');
			return surf('z', c, cond);
		}
		if (rel.length === 1 && rel[0].op === '=') {
			var L = src.slice(0, rel[0].pos).trim(), R = src.slice(rel[0].pos + 1).trim();
			if (!L || !R) throw new Error('Finish the equation');
			var fd = /^([A-Za-z])\(\s*([A-Za-z])\s*(?:,\s*([A-Za-z])\s*)?(?:,\s*([A-Za-z])\s*)?\)$/.exec(L);
			if (fd && !VARS[fd[1]] && fd[1] !== 'e') {
				var names = [fd[2], fd[3], fd[4]].filter(Boolean), alias = {}, slots = ['x', 'y', 'z'];
				names.forEach(function (n, k) { alias[n] = slots[k]; });
				var body = compile(R, env, alias), bf = body.fn;
				env.F[fd[1]] = function (a, b, c3) { return bf(a, b, c3, 0, 0, 0); };
				if (names.length === 2) { var d2 = surf('z', body, cond); d2.def = fd[1] + '(' + names.join(', ') + ')'; return d2; }
				return { kind: 'def', def: fd[1] + '(' + names.join(', ') + ')', params: mix([body]) };
			}
			if (L === 'z' || L === 'x' || L === 'y') {
				var cr = compile(R, env);
				if (cr.used.u || cr.used.v || cr.used.t) throw new Error('t, u and v go inside ( , , ) for curves and surfaces');
				if (!cr.used[L]) return surf(L, cr, cond);
				var lf = cr.fn, li = 'xyz'.indexOf(L);
				return { kind: 'implicit', f: function (x, y, z) { return [x, y, z][li] - lf(x, y, z, 0, 0, 0); }, cond: ctest, params: mix([cr]) };
			}
			if (/^[A-Za-z]$/.test(L) && !VARS[L] && L !== 'e') {
				var cv = compile(R, env);
				if (!any([cv], 'xyzuvt')) return { kind: 'param', name: L, value: cv.fn(0, 0, 0, 0, 0, 0), params: mix([cv]) };
			}
			var a = compile(L, env), b = compile(R, env);
			if (any([a, b], 'uvt')) throw new Error('t, u and v go inside ( , , ) for curves and surfaces');
			if (!any([a, b], 'xyz')) throw new Error('Use x, y and/or z in an equation');
			var af = a.fn, bf2 = b.fn;
			return { kind: 'implicit', f: function (x, y, z) { return af(x, y, z, 0, 0, 0) - bf2(x, y, z, 0, 0, 0); }, cond: ctest, params: mix([a, b]) };
		}
		throw new Error('Inequalities are not drawn in 3D. To cut a surface, add a restriction: z = x^2 {z < 3}');
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
	function ticks(lo, hi, count) {             // nice tick values inside [lo, hi]
		var step = niceStep((hi - lo) / (count || 6)), out = [];
		for (var i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i++) out.push(Math.abs(i * step) < step * 1e-9 ? 0 : i * step);
		return { step: step, values: out };
	}

	/* ---------- meshing ---------- */
	// metric used to decide whether two neighbouring samples are "far apart": max coordinate gap as a fraction of the box
	function gapFn(dom) {
		var rx = dom.x[1] - dom.x[0], ry = dom.y[1] - dom.y[0], rz = dom.z[1] - dom.z[0];
		return function (a, b) { return Math.max(Math.abs(a[0] - b[0]) / rx, Math.abs(a[1] - b[1]) / ry, Math.abs(a[2] - b[2]) / rz); };
	}
	function finite3(p) { return p && isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2]); }
	// Is there a jump / asymptote between parameter s0 and s1 (points a, b)? A continuous piece keeps getting shorter as
	// we bisect towards the bigger half; a jump does not.
	function jumps(at, s0, s1, a, b, gap, thr) {
		for (var k = 0; k < 14; k++) {
			if (gap(a, b) <= thr) return false;
			var sm = (s0 + s1) / 2, m = at(sm);
			if (!finite3(m)) return true;
			if (gap(a, m) > gap(m, b)) { s1 = sm; b = m; } else { s0 = sm; a = m; }
		}
		return true;
	}
	// at(s, t) -> [x, y, z] (or null) for s, t in [0, 1]. Returns positions (data coords), per-vertex ok flags and triangle indices,
	// with quads dropped where a corner is missing or an edge crosses a jump (1/x, tan x).
	function gridMesh(at, nu, nv, dom, cond) {
		var gap = gapFn(dom), N = (nu + 1) * (nv + 1), pos = new Float64Array(N * 3), ok = new Uint8Array(N), i, j, k;
		var span = Math.max(dom.x[1] - dom.x[0], dom.y[1] - dom.y[0], dom.z[1] - dom.z[0]) * 1e4;
		function good(p) { return finite3(p) && Math.abs(p[0]) < span && Math.abs(p[1]) < span && Math.abs(p[2]) < span && (!cond || cond(p)); }
		function sample(s, t) {
			var p = at(s, t);
			if (!good(p)) { p = at(s + 1e-7, t + 1e-7); if (!good(p)) return null; }   // removable holes like sin(r)/r at r = 0
			return p;
		}
		for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
			var p = sample(i / nu, j / nv), q = j * (nu + 1) + i;
			if (p) { ok[q] = 1; pos[q * 3] = p[0]; pos[q * 3 + 1] = p[1]; pos[q * 3 + 2] = p[2]; }
		}
		function P(q) { return [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]]; }
		var THR = 0.08;
		// broken edges: horizontal (i -> i+1) and vertical (j -> j+1)
		var hb = new Uint8Array(N), vb = new Uint8Array(N);
		for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
			var q0 = j * (nu + 1) + i;
			if (!ok[q0]) continue;
			if (i < nu && ok[q0 + 1]) { var A = P(q0), B = P(q0 + 1); if (gap(A, B) > THR) { var tj = j / nv; hb[q0] = jumps(function (s) { return at(s, tj); }, i / nu, (i + 1) / nu, A, B, gap, THR) ? 1 : 0; } }
			if (j < nv && ok[q0 + nu + 1]) { var C = P(q0), D = P(q0 + nu + 1); if (gap(C, D) > THR) { var si = i / nu; vb[q0] = jumps(function (t) { return at(si, t); }, j / nv, (j + 1) / nv, C, D, gap, THR) ? 1 : 0; } }
		}
		var idx = [];
		for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
			var a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
			if (!ok[a] || !ok[b] || !ok[c] || !ok[d]) continue;
			if (hb[a] || hb[c] || vb[a] || vb[b]) continue;
			idx.push(a, b, d, a, d, c);
		}
		return { pos: pos, ok: ok, idx: idx, nu: nu, nv: nv, hb: hb, vb: vb };
	}
	// z = f(x, y) (or x = f(y, z), y = f(x, z)) over the box
	function surfaceMesh(d, dom, n) {
		var A, B;
		if (d.axis === 'z') { A = dom.x; B = dom.y; } else if (d.axis === 'x') { A = dom.y; B = dom.z; } else { A = dom.x; B = dom.z; }
		var f = d.f, cond = d.cond;
		var at = function (s, t) {
			var a = A[0] + (A[1] - A[0]) * s, b = B[0] + (B[1] - B[0]) * t, w = f(a, b);
			return d.axis === 'z' ? [a, b, w] : d.axis === 'x' ? [w, a, b] : [a, w, b];
		};
		return gridMesh(at, n, n, dom, cond ? function (p) { return cond(p[0], p[1], p[2], 0, 0, 0); } : null);
	}
	function psurfaceMesh(d, dom, n) {
		var u0 = d.u.lo, u1 = d.u.hi, v0 = d.v.lo, v1 = d.v.hi, cond = d.cond;
		var at = function (s, t) { var u = u0 + (u1 - u0) * s, v = v0 + (v1 - v0) * t; return [d.fx(0, 0, 0, u, v, 0), d.fy(0, 0, 0, u, v, 0), d.fz(0, 0, 0, u, v, 0)]; };
		var g = gridMesh(at, n, n, dom, null);
		if (cond) {   // a restriction on a parametric surface can use x, y, z, u and v
			for (var j = 0; j <= n; j++) for (var i = 0; i <= n; i++) {
				var q = j * (n + 1) + i; if (!g.ok[q]) continue;
				if (!cond(g.pos[q * 3], g.pos[q * 3 + 1], g.pos[q * 3 + 2], u0 + (u1 - u0) * i / n, v0 + (v1 - v0) * j / n, 0)) g.ok[q] = 0;
			}
			var keep = [];
			for (var k = 0; k < g.idx.length; k += 3) if (g.ok[g.idx[k]] && g.ok[g.idx[k + 1]] && g.ok[g.idx[k + 2]]) keep.push(g.idx[k], g.idx[k + 1], g.idx[k + 2]);
			g.idx = keep;
		}
		return g;
	}
	// parametric curve -> list of continuous pieces (arrays of [x,y,z])
	function curvePieces(d, dom, n) {
		var t0 = d.t.lo, t1 = d.t.hi, gap = gapFn(dom), out = [], cur = [], prev = null, ps = 0;
		if (!(t1 > t0)) return out;
		var at = function (s) { var t = t0 + (t1 - t0) * s; return [d.fx(0, 0, 0, 0, 0, t), d.fy(0, 0, 0, 0, 0, t), d.fz(0, 0, 0, 0, 0, t)]; };
		var span = Math.max(dom.x[1] - dom.x[0], dom.y[1] - dom.y[0], dom.z[1] - dom.z[0]) * 1e4;
		for (var i = 0; i <= n; i++) {
			var s = i / n, p = at(s), t = t0 + (t1 - t0) * s;
			var good = finite3(p) && Math.abs(p[0]) < span && Math.abs(p[1]) < span && Math.abs(p[2]) < span && (!d.cond || d.cond(p[0], p[1], p[2], 0, 0, t));
			if (!good) { if (cur.length > 1) out.push(cur); cur = []; prev = null; continue; }
			if (prev && gap(prev, p) > 0.08 && jumps(at, ps, s, prev, p, gap, 0.08)) { if (cur.length > 1) out.push(cur); cur = []; }
			cur.push(p); prev = p; ps = s;
		}
		if (cur.length > 1) out.push(cur);
		return out;
	}
	// Implicit surface f(x,y,z) = 0 by naive surface nets: one vertex per sign-changing cell (the average of its edge
	// crossings), one quad per sign-changing grid edge. dom gets padded by a cell so the box clip leaves clean edges.
	var CUBE_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
	function implicitMesh(d, dom, n) {
		var f = d.f, cond = d.cond, nx = n, ny = n, nz = n;
		var x0 = dom.x[0], y0 = dom.y[0], z0 = dom.z[0];
		var hx = (dom.x[1] - dom.x[0]) / (n - 2), hy = (dom.y[1] - dom.y[0]) / (n - 2), hz = (dom.z[1] - dom.z[0]) / (n - 2);
		x0 -= hx; y0 -= hy; z0 -= hz;
		// tiny offset so symmetric shapes don't put samples exactly on the surface (f = 0 corners make degenerate cells)
		x0 += hx * 1e-3; y0 += hy * 1.3e-3; z0 += hz * 0.7e-3;
		var sx = nx + 1, sxy = (nx + 1) * (ny + 1), val = new Float64Array(sxy * (nz + 1)), i, j, k;
		for (k = 0; k <= nz; k++) { var z = z0 + k * hz; for (j = 0; j <= ny; j++) { var y = y0 + j * hy; for (i = 0; i <= nx; i++) {
			var x = x0 + i * hx, w = f(x, y, z);
			if (cond && !cond(x, y, z, 0, 0, 0)) w = NaN;
			val[k * sxy + j * sx + i] = w;
		} } }
		var cellV = new Int32Array(nx * ny * nz).fill(-1), pos = [], c = new Float64Array(8);
		for (k = 0; k < nz; k++) for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
			var mask = 0, bad = false, base = k * sxy + j * sx + i;
			for (var q = 0; q < 8; q++) {
				var w2 = val[base + (q & 1) + ((q >> 1) & 1) * sx + ((q >> 2) & 1) * sxy];
				if (!(Math.abs(w2) < 1e8)) { bad = true; break; }
				c[q] = w2; if (w2 > 0) mask |= 1 << q;
			}
			if (bad || mask === 0 || mask === 255) continue;
			var ax = 0, ay = 0, az = 0, cnt = 0;
			for (var e = 0; e < 12; e++) {
				var p0 = CUBE_EDGES[e][0], p1 = CUBE_EDGES[e][1], a0 = c[p0], a1 = c[p1];
				if ((a0 > 0) === (a1 > 0)) continue;
				var tt = a0 / (a0 - a1);
				ax += (p0 & 1) + ((p1 & 1) - (p0 & 1)) * tt;
				ay += ((p0 >> 1) & 1) + (((p1 >> 1) & 1) - ((p0 >> 1) & 1)) * tt;
				az += ((p0 >> 2) & 1) + (((p1 >> 2) & 1) - ((p0 >> 2) & 1)) * tt;
				cnt++;
			}
			cellV[(k * ny + j) * nx + i] = pos.length / 3;
			pos.push(x0 + (i + ax / cnt) * hx, y0 + (j + ay / cnt) * hy, z0 + (k + az / cnt) * hz);
		}
		function cv(i2, j2, k2) { return cellV[(k2 * ny + j2) * nx + i2]; }
		var idx = [];
		function quad(a, b, c2, d2, flip) {
			if (a < 0 || b < 0 || c2 < 0 || d2 < 0) return;
			if (flip) idx.push(a, c2, b, a, d2, c2); else idx.push(a, b, c2, a, c2, d2);
		}
		// edges along x: corners (i,j,k)-(i+1,j,k), shared by cells (i, j-1..j, k-1..k)
		for (k = 1; k < nz; k++) for (j = 1; j < ny; j++) for (i = 0; i < nx; i++) {
			var g0 = val[k * sxy + j * sx + i], g1 = val[k * sxy + j * sx + i + 1];
			if ((g0 > 0) === (g1 > 0) || g0 !== g0 || g1 !== g1) continue;
			quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k), g0 > 0);
		}
		for (k = 1; k < nz; k++) for (j = 0; j < ny; j++) for (i = 1; i < nx; i++) {
			var h0 = val[k * sxy + j * sx + i], h1 = val[k * sxy + (j + 1) * sx + i];
			if ((h0 > 0) === (h1 > 0) || h0 !== h0 || h1 !== h1) continue;
			quad(cv(i - 1, j, k - 1), cv(i - 1, j, k), cv(i, j, k), cv(i, j, k - 1), h0 > 0);
		}
		for (k = 0; k < nz; k++) for (j = 1; j < ny; j++) for (i = 1; i < nx; i++) {
			var l0 = val[k * sxy + j * sx + i], l1 = val[(k + 1) * sxy + j * sx + i];
			if ((l0 > 0) === (l1 > 0) || l0 !== l0 || l1 !== l1) continue;
			quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k), l0 > 0);
		}
		return { pos: pos, idx: idx };
	}

	return { makeM: makeM, analyze: analyze, compile: compile, tokenize: tokenize, fmtn: fmtn, niceStep: niceStep, ticks: ticks,
		surfaceMesh: surfaceMesh, psurfaceMesh: psurfaceMesh, curvePieces: curvePieces, implicitMesh: implicitMesh, gridMesh: gridMesh };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = G3;
