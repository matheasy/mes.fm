/* MES CAS client: starts cas-worker.js (Pyodide + SymPy) on first use and talks to it.
   window.MESCAS = {
     start()                -> Promise (resolves when the engine is ready; idempotent),
     call(req, opts)        -> Promise<result>; opts: {timeout (ms, default 25000), onPartial(result)}.
                               One request at a time; on timeout / cancel the worker is terminated (the only way to stop
                               a busy Python thread) and a fresh one is started on the next call (the files come from the
                               browser cache then, so a restart takes a few seconds, not a re-download).
     cancel(), busy(), state(): 'idle'|'loading'|'ready'|'failed', onStatus(fn): fn({state, stage, pct, error})
   }
   Rejections carry {code: 'timeout'|'cancel'|'fatal'|'unsupported', message}. */
(function () {
	'use strict';
	if (window.MESCAS) return;
	var V = '1';
	var WORKER = '/main_js/cas/cas-worker.js?v=' + V, ENGINE = '/main_js/cas/engine.py?v=' + V;
	var worker = null, readyP = null, readyRes = null, readyRej = null, st = 'idle', listeners = [], seq = 0, inflight = null;
	var info = { stage: '', pct: 0, error: '', ms: 0, versions: null, loads: 0 };

	function emit() { var s = { state: st, stage: info.stage, pct: info.pct, error: info.error, ms: info.ms }; listeners.forEach(function (f) { try { f(s); } catch (e) {} }); }
	function fail(code, message) { var e = new Error(message); e.code = code; return e; }
	function supported() { return typeof WebAssembly === 'object' && typeof Worker === 'function'; }

	function start() {
		if (readyP) return readyP;
		if (!supported()) { st = 'failed'; info.error = 'unsupported'; emit(); return Promise.reject(fail('unsupported', 'This browser cannot run the math engine (it needs WebAssembly and Web Workers).')); }
		st = 'loading'; info.stage = 'runtime'; info.pct = 2; info.error = ''; emit();
		var t0 = performance.now();
		readyP = new Promise(function (res, rej) { readyRes = res; readyRej = rej; });
		readyP.catch(function () {});
		try { worker = new Worker(WORKER); }
		catch (e) { st = 'failed'; info.error = 'worker'; emit(); readyRej(fail('fatal', 'Could not start the math engine.')); return readyP; }
		worker.onmessage = function (ev) {
			var m = ev.data || {};
			if (m.type === 'progress') { info.stage = m.stage; info.pct = m.pct; emit(); }
			else if (m.type === 'ready') {
				st = 'ready'; info.pct = 100; info.stage = 'ready'; info.ms = Math.round(performance.now() - t0); info.versions = m.versions; info.loads++;
				try { console.info('[MES CAS] engine ready in ' + info.ms + ' ms', m.versions); } catch (e) {}
				emit(); readyRes();
			}
			else if (m.type === 'fatal') {
				st = 'failed';
				info.error = m.error === 'wasm' ? 'unsupported' : (m.error === 'cdn' || /fetch|network|load|import/i.test(m.error) ? 'cdn' : m.error);
				emit();
				readyRej(fail('fatal', info.error === 'cdn' ? 'The math engine could not be downloaded (offline, or the CDN is blocked). Check your connection and try again.'
					: info.error === 'unsupported' ? 'This browser cannot run the math engine (it needs WebAssembly).' : 'The math engine failed to start: ' + info.error));
				kill();
			}
			else if (inflight && m.id === inflight.id) {
				if (m.type === 'partial') { try { var p = JSON.parse(m.data); inflight.onPartial && inflight.onPartial(p); } catch (e) {} }
				else if (m.type === 'result') {
					var job = inflight; inflight = null; clearTimeout(job.timer);
					var r; try { r = JSON.parse(m.data); } catch (e) { r = { ok: false, error: 'Bad reply from the engine.' }; }
					job.res(r); pump();
				}
			}
		};
		worker.onerror = function (ev) {
			if (st === 'loading') { st = 'failed'; info.error = 'cdn'; emit(); readyRej(fail('fatal', 'The math engine could not be loaded. Check your connection and try again.')); kill(); }
		};
		worker.postMessage({ type: 'init', engine: ENGINE });
		return readyP;
	}

	function kill() {
		if (worker) { try { worker.terminate(); } catch (e) {} }
		worker = null; readyP = null;
		if (st !== 'failed') { st = 'idle'; info.stage = ''; info.pct = 0; }
		emit();
	}

	var queue = [];
	function pump() {
		if (inflight || !queue.length) return;
		var job = queue.shift();
		start().then(function () {
			if (job.dead) { pump(); return; }
			inflight = job; job.id = ++seq;
			job.timer = setTimeout(function () { abort('timeout'); }, job.timeout);
			worker.postMessage({ type: 'call', id: job.id, req: job.req });
		}, function (err) { job.rej(err); queue.forEach(function (j) { j.rej(err); }); queue = []; });
	}
	function abort(code) {
		var job = inflight; inflight = null;
		if (job) { clearTimeout(job.timer); job.rej(fail(code, code === 'timeout' ? 'That took too long, so it was stopped.' : 'Cancelled.')); }
		queue.forEach(function (j) { j.dead = true; j.rej(fail('cancel', 'Cancelled.')); }); queue = [];
		kill();
		if (st === 'failed') st = 'idle';
	}

	function call(req, opts) {
		opts = opts || {};
		return new Promise(function (res, rej) {
			queue.push({ req: req, res: res, rej: rej, timeout: opts.timeout || 25000, onPartial: opts.onPartial });
			if (st === 'failed') { readyP = null; st = 'idle'; }
			pump();
		});
	}

	window.MESCAS = {
		start: function () { if (st === 'failed') { readyP = null; st = 'idle'; } return start(); },
		call: call,
		cancel: function () { abort('cancel'); },
		busy: function () { return !!inflight || queue.length > 0; },
		state: function () { return st; },
		info: function () { return info; },
		supported: supported,
		onStatus: function (fn) { listeners.push(fn); }
	};
})();
