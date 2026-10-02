/* MES CAS worker: Pyodide (CPython compiled to WebAssembly) + SymPy + mpmath, running engine.py off the main thread.
   Loaded by cas-client.js only when someone actually uses a CAS / derivative / integral page. Messages:
     in : {type:'init', engine:'/main_js/cas/engine.py?v=N'}   {type:'call', id, req:{op, ...}}
     out: {type:'progress', stage, pct}  {type:'ready', ms, versions}  {type:'fatal', error}
          {type:'partial', id, data:'json'}  {type:'result', id, data:'json'}
   The Pyodide version is pinned: its sympy (1.13.3) / mpmath (1.3.0) are what tool_apps_src/cas-engine-tests.py is run against. */
'use strict';
var PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
var engine = null, ready = null, current = null;

function post(m) { self.postMessage(m); }

function init(engineUrl) {
	var t0 = Date.now();
	post({ type: 'progress', stage: 'runtime', pct: 4 });
	try { importScripts(PYODIDE + 'pyodide.js'); }
	catch (e) { return Promise.reject(new Error('cdn')); }
	var py;
	return self.loadPyodide({ indexURL: PYODIDE, stdout: function () {}, stderr: function () {} }).then(function (p) {
		py = p;
		post({ type: 'progress', stage: 'packages', pct: 45 });
		return py.loadPackage(['mpmath', 'sympy'], { messageCallback: function () {}, errorCallback: function () {} });
	}).then(function () {
		post({ type: 'progress', stage: 'engine', pct: 80 });
		return fetch(engineUrl).then(function (r) { if (!r.ok) throw new Error('engine.py ' + r.status); return r.text(); });
	}).then(function (src) {
		py.FS.mkdirTree('/home/pyodide/mes');
		py.FS.writeFile('/home/pyodide/mes/engine.py', src);
		py.runPython('import sys\nif "/home/pyodide/mes" not in sys.path: sys.path.insert(0, "/home/pyodide/mes")');
		engine = py.pyimport('engine');
		engine.set_emitter(function (s) { if (current != null) post({ type: 'partial', id: current, data: String(s) }); });
		post({ type: 'progress', stage: 'warm', pct: 92 });
		// first calls import the heavy parts of SymPy (parser, solvers, integrals): do it now, not on the first click
		engine.handle(JSON.stringify({ op: 'parse', expr: 'x^2 + sin x' }));
		engine.handle(JSON.stringify({ op: 'diff', expr: 'x^2' }));
		var v = JSON.parse(engine.handle(JSON.stringify({ op: 'ping' })));
		post({ type: 'ready', ms: Date.now() - t0, versions: { pyodide: py.version, sympy: v.sympy, engine: v.version } });
	});
}

self.onmessage = function (ev) {
	var m = ev.data || {};
	if (m.type === 'init') {
		if (typeof WebAssembly !== 'object') { post({ type: 'fatal', error: 'wasm' }); return; }
		ready = init(m.engine).catch(function (err) { post({ type: 'fatal', error: String(err && err.message || err) }); throw err; });
		return;
	}
	if (m.type === 'call') {
		(ready || Promise.reject(new Error('not initialised'))).then(function () {
			current = m.id;
			var out;
			try { out = engine.handle(JSON.stringify(m.req)); }
			catch (e) { out = JSON.stringify({ ok: false, error: 'Engine error: ' + String(e && e.message || e).split('\n').slice(-2).join(' ') }); }
			current = null;
			post({ type: 'result', id: m.id, data: String(out) });
		}, function () {});
	}
};
