/* MES Archive extension: settings + which addresses to open. Needs engines.js (MESArchive) first. Pure helpers, node-tested (tool_apps_src/archive-tests.js). */
var MESARX = (function () {
	'use strict';
	var A = typeof MESArchive !== 'undefined' ? MESArchive : require('./engines.js');
	var DEFAULTS = { sel: ['wb-save', 'at-save', 'ghost'], custom: [], vars: {}, strip: true, background: false };
	function normalise(raw) {
		var s = JSON.parse(JSON.stringify(DEFAULTS)); raw = raw || {};
		if (Array.isArray(raw.sel)) s.sel = raw.sel.filter(function (x) { return typeof x === 'string'; });
		if (Array.isArray(raw.custom)) s.custom = raw.custom.filter(function (c) { return c && typeof c.id === 'string' && typeof c.name === 'string' && A.validTemplate(c.tpl); }).slice(0, 30);
		if (raw.vars && typeof raw.vars === 'object') s.vars = raw.vars;
		if (typeof raw.strip === 'boolean') s.strip = raw.strip; if (typeof raw.background === 'boolean') s.background = raw.background;
		return s;
	}
	function allEngines(s) { return A.ENGINES.concat(s.custom.map(function (c) { return { id: c.id, name: c.name, g: 'custom', badge: [c.name.slice(0, 2), '#64748b'], custom: c.tpl, note: 'Your own site.' }; })); }
	/* [{engine, url}] for the ticked engines, in the order of the list; [] when the page is not an http(s) address */
	function targets(s, pageUrl) {
		var url = A.cleanUrl(pageUrl, s.strip); if (!url) return [];
		return allEngines(s).filter(function (e) { return s.sel.indexOf(e.id) >= 0; }).map(function (e) { return { engine: e, url: e.custom ? A.customUrl(e.custom, url) : A.build(e, url, s.vars[e.id]) }; });
	}
	/* archive.today save address that failed (HTTP 429 etc.) -> the same request on the next archive.<v> address not in `tried` (hosts, e.g. ['ph']); null when none is left or the address is not an archive.today save request */
	var AT_HOSTS = ['ph', 'is', 'today', 'md', 'vn', 'li', 'fo'];
	function retryUrl(failedUrl, tried) {
		var m = /^https:\/\/archive\.(ph|is|today|md|vn|li|fo)\/(\?run=1&url=.*)$/.exec(String(failedUrl || '')); if (!m) return null;
		var done = (tried || []).concat([m[1]]), next = AT_HOSTS.filter(function (h) { return done.indexOf(h) < 0; })[0];
		return next ? 'https://archive.' + next + '/' + m[2] : null;
	}
	return { DEFAULTS: DEFAULTS, normalise: normalise, allEngines: allEngines, targets: targets, retryUrl: retryUrl };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESARX;
