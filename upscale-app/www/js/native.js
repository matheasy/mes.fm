/* MES Upscale app: connects the page (mes.fm/upscale's upscaler) to the AppSave plugin.
 * window.MESAppSave(blob, name)   = a small sheet: Save to Photos (iPhone) / Save to gallery (Android), Share..., Cancel
 * window.MESAppSaveAll([{blob, name}]) = every result straight into Photos / the gallery, one after another */
(function () {
	var C = window.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
	var P = (C.Plugins && C.Plugins.AppSave) || (C.registerPlugin && C.registerPlugin("AppSave")); if (!P) return;
	var android = C.getPlatform && C.getPlatform() === "android";
	/* iOS: the app's own files (capacitor://localhost/...) come back from fetch() with status 0 although the body is there,
	   so code that checks response.ok (the model loader) thinks they failed. Report them as 200. */
	if (!android && window.fetch) {
		var f0 = window.fetch.bind(window);
		window.fetch = function (input, init) {
			var url = typeof input === "string" ? input : (input && input.url) || "";
			var own = !/^[a-z]+:/i.test(url) || url.indexOf(location.origin) === 0;
			return f0(input, init).then(function (r) {
				if (!own || r.status !== 0 || r.type === "opaque") return r;
				return r.arrayBuffer().then(function (b) {
					if (!b.byteLength) return r;
					return new Response(b, { status: 200, statusText: "OK", headers: r.headers });
				});
			});
		};
	}
	function b64(u8) { var s = "", i, CH = 0x8000; for (i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
	function toast(msg) { var t = document.createElement("div"); t.className = "tu-toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3600); }
	function send(blob, name, mode) {
		return P.saveBegin({ name: name }).then(function () { return blob.arrayBuffer(); }).then(function (ab) {
			var u8 = new Uint8Array(ab), CH = 768 * 1024, p = Promise.resolve();
			for (var i = 0; i < u8.length; i += CH) (function (a) { p = p.then(function () { return P.saveChunk({ data: b64(u8.subarray(a, a + CH)) }); }); })(i);
			return p;
		}).then(function () { return P.saveEnd({ mode: mode, mime: blob.type || "image/png", folder: "MES Upscale" }); });
	}
	function sheet(name, items) {
		var s = document.createElement("div"); s.id = "as-scrim";
		s.innerHTML = '<div id="as-box" role="dialog" aria-label="Save"><div class="t"></div></div>';
		s.querySelector(".t").textContent = name;
		var box = s.querySelector("#as-box");
		items.concat([["Cancel", null]]).forEach(function (x, i) {
			var b = document.createElement("button"); b.type = "button"; b.textContent = x[0]; if (i === 0) b.className = "p";
			b.onclick = function () { s.remove(); if (x[1]) x[1](); }; box.appendChild(b);
		});
		s.addEventListener("click", function (e) { if (e.target === s) s.remove(); });
		document.body.appendChild(s);
	}
	function run(blob, name, mode) { return send(blob, name, mode).then(function (r) { if (r && r.msg) toast(r.msg); }).catch(function (e) { toast("Could not save: " + ((e && e.message) || e)); }); }
	window.MESAppSave = function (blob, name) {
		sheet(name, [[android ? "Save to gallery" : "Save to Photos", function () { run(blob, name, "save"); }],
			["Share…", function () { run(blob, name, "share"); }],
			[android ? "Save to Downloads" : "Save to Files", function () { run(blob, name, android ? "download" : "files"); }]]);
	};
	window.MESAppSaveAll = function (list) {
		var ok = 0, p = Promise.resolve();
		list.forEach(function (o) { p = p.then(function () { return send(o.blob, o.name, "save").then(function (r) { if (!r || r.saved !== false) ok++; }); }); });
		p.then(function () { toast("Saved " + ok + " of " + list.length + " pictures to " + (android ? "your gallery (Pictures / MES Upscale)" : "Photos")); })
			.catch(function (e) { toast("Could not save: " + ((e && e.message) || e)); });
	};
})();
