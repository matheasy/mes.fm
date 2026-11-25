/* MES AI Helper: the bridge between the mes.fm/ai page and the extension.
   The page posts {mesai: "req", id, cmd, args}; this forwards it to the service worker and posts back {mesai: "res", id, ok, result | error}.
   Only messages from this same window are accepted; nothing is read from the page itself. */
(function () {
	"use strict";
	if (window.__mesaiBridge) return; window.__mesaiBridge = 1;
	var local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
	// on 127.0.0.1 / localhost only pages that ask for it (the local preview of mes.fm/ai) get the bridge
	if (local && !/\/ai(\b|[-/?#])/.test(location.pathname + location.search)) return;
	var V = chrome.runtime.getManifest().version;
	function hello() { window.postMessage({ mesai: "hello", version: V }, location.origin); }
	window.addEventListener("message", function (e) {
		if (e.source !== window || e.origin !== location.origin || !e.data || typeof e.data !== "object") return;
		var d = e.data;
		if (d.mesai === "ping") return hello();
		if (d.mesai !== "req" || typeof d.cmd !== "string") return;
		try {
			chrome.runtime.sendMessage({ cmd: d.cmd, args: d.args || {} }, function (r) {
				var err = chrome.runtime.lastError;
				window.postMessage({ mesai: "res", id: d.id, ok: !err && r && r.ok, result: r && r.result, error: err ? err.message : r && r.error }, location.origin);
			});
		} catch (x) { window.postMessage({ mesai: "res", id: d.id, ok: false, error: "The extension was updated: reload this page." }, location.origin); }
	});
	chrome.runtime.onMessage.addListener(function (m) { if (m && m.stopTask) window.postMessage({ mesai: "stop" }, location.origin); });
	hello();
	document.addEventListener("DOMContentLoaded", hello);
})();
