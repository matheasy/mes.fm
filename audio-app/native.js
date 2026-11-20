/* MES Audio app: connects the page (mes.fm/audio's editor) to the AudioNative plugin.
 * window.MESAudioNative.rec  = native recorder (Android foreground service / iOS background audio: keeps recording with the screen off)
 * window.MESAudioNative.save = a finished export to the share sheet or to Downloads (Android) / the Files "Save" picker (iPhone). */
(function () {
	var C = window.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
	var P = (C.Plugins && C.Plugins.AudioNative) || (C.registerPlugin && C.registerPlugin("AudioNative")); if (!P) return;
	var android = C.getPlatform && C.getPlatform() === "android";
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
					var url = C.convertFileSrc("file://" + r.path);
					return fetch(url).then(function (x) { if (!x.ok) throw new Error("could not read the recording (" + x.status + ")"); return x.arrayBuffer(); })
						.then(function (buf) { return { buf: buf, discard: function () { P.remove({ path: r.path }); } }; });
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
