/* MES Audio app: connects the page (mes.fm/audio's editor) to the AudioNative plugin.
 * window.MESAudioNative.rec  = native recorder (Android foreground service / iOS background audio: keeps recording with the screen off)
 * window.MESAudioNative.save = a finished export to the share sheet or to Downloads (Android) / the Files "Save" picker (iPhone). */
(function () {
	var C = window.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
	var P = (C.Plugins && C.Plugins.AudioNative) || (C.registerPlugin && C.registerPlugin("AudioNative")); if (!P) return;
	var android = C.getPlatform && C.getPlatform() === "android";
	/* iOS: the app's own files (capacitor://localhost/...) come back from fetch() with status 0 although the body is there,
	   so code that checks response.ok (the test clip, denoise.js's model loader) thinks they failed. Report them as 200. */
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
	function err(e) { return new Error((e && (e.message || e.errorMessage)) || String(e)); }
	window.MESAudioNative = {
		platform: android ? "android" : "ios",
		saveLabel: android ? "⬇ Save" : "⬇ Save to Files",
		rec: {
			start: function () { return P.start().catch(function (e) { throw err(e); }); },
			level: function () { return P.level(); },
			stop: function () {
				return P.stop().then(function (r) {
					var parts = [], CH = 2097152;
					function next(off) {
						return P.readChunk({ path: r.path, offset: off, length: CH }).then(function (o) {
							var bin = atob(o.data), u = new Uint8Array(bin.length);
							for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
							parts.push(u); off += u.length;
							return off < o.size && u.length ? next(off) : null;
						});
					}
					return next(0).then(function () {
						var n = parts.reduce(function (a, p) { return a + p.length; }, 0), all = new Uint8Array(n), k = 0;
						parts.forEach(function (p) { all.set(p, k); k += p.length; });
						if (!n) throw new Error("the recording is empty");
						return { buf: all.buffer, discard: function () { P.remove({ path: r.path }); } };
					});
				}).catch(function (e) { throw err(e); });
			}
		},
		save: function (blob, name, mode) {
			return P.saveBegin({ name: name }).then(function () { return blob.arrayBuffer(); }).then(function (ab) {
				var u8 = new Uint8Array(ab), CH = 768 * 1024, p = Promise.resolve();
				for (var i = 0; i < u8.length; i += CH) (function (a) { p = p.then(function () { return P.saveChunk({ data: b64(u8.subarray(a, a + CH)) }); }); })(i);
				return p;
			}).then(function () { return P.saveEnd({ mode: mode, mime: blob.type || "audio/*" }); }).catch(function (e) { throw err(e); });
		}
	};
})();
