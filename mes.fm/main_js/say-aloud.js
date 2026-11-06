/* MES say-aloud: spoken alert messages for the Reminder and the Timer family (mes.fm/reminder, /timer, /countdown-timer, /alarm-clock ...).
 * window.MESSay = {
 *   ok                       true when the browser has speech (Web Speech API)
 *   speak(text, {voice, vol, rate}) -> Promise<"done"|"blocked"|"failed"|"none">   speaks once; "blocked" = the browser refuses to talk
 *                            before the person has clicked the page once (Chrome / Brave / Safari drop speak() silently then)
 *   stop()                   stops speaking
 *   activated()              has this tab had a click / key press yet (navigator.userActivation), so speech and sound are allowed
 *   fill(text, vars)         replaces {title} {in} {time} {label} ... with vars (unknown ones stay)
 *   voiceSelect(sel, key, onChange)   fills a <select> with the voices (value = (voiceURI || name) + "|" + lang, "" = automatic) and makes it searchable
 *                            with /main_js/voice-picker.js when that is loaded
 *   armNote(el, needFn)      shows el (a "click this page once" note) while needFn() is true and the tab has had no click; hides it on the first click
 *   leaveGuard(fn)           asks "Leave site?" when the tab is closed / reloaded while fn() returns true (needs one earlier click, a browser rule)
 * }
 * Speech uses the voices on this device, so nothing is uploaded. Node: require("./say-aloud.js").fill(...) for tests.
 */
(function (root) {
	"use strict";
	function fill(text, vars) {
		return String(text == null ? "" : text).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? String(vars[k]) : m; });
	}
	function voiceKey(v) { return (v.voiceURI || v.name) + "|" + v.lang; }
	if (typeof window === "undefined") { if (typeof module !== "undefined") module.exports = { fill: fill, voiceKey: voiceKey }; return; }
	if (window.MESSay) return;
	var synth = window.speechSynthesis, ok = !!(synth && window.SpeechSynthesisUtterance);
	var keep = [];     // Chrome garbage-collects an utterance that nothing references and its events never fire
	function voices() { try { return ok ? synth.getVoices() || [] : []; } catch (e) { return []; } }
	function findVoice(key) {
		var list = voices(); if (!list.length) return null;
		if (key) { for (var i = 0; i < list.length; i++) if (voiceKey(list[i]) === key) return list[i]; }
		var lang = (navigator.language || "en").toLowerCase(), base = lang.split("-")[0], best = null, score = -1;
		list.forEach(function (v) {
			var l = String(v.lang || "").toLowerCase().replace("_", "-"), s = 0;
			if (l === lang) s = 4; else if (l.split("-")[0] === base) s = 3; else if (l.indexOf("en") === 0) s = 1;
			if (v.localService) s += 0.5; if (v.default) s += 0.25;
			if (/bells|boing|bubbles|cellos|zarvox|whisper|bad news|good news|jester|organ|superstar|trinoids|wobble|albert|bahh/i.test(v.name)) s -= 3;
			if (s > score) { score = s; best = v; }
		});
		return best;
	}
	function activated() { var ua = navigator.userActivation; return !ua || ua.hasBeenActive; }
	function speak(text, o) {
		o = o || {};
		return new Promise(function (resolve) {
			text = String(text || "").trim();
			if (!ok || !text) { resolve("none"); return; }
			if (!activated()) { resolve("blocked"); return; }
			var u = new SpeechSynthesisUtterance(text.slice(0, 600)), v = findVoice(o.voice), started = false, done = false;
			if (v) { u.voice = v; u.lang = v.lang; }
			u.volume = Math.max(0, Math.min(1, o.vol == null ? 1 : o.vol)); u.rate = o.rate || 0.95;
			function end(r) { if (done) return; done = true; clearTimeout(t); var k = keep.indexOf(u); if (k >= 0) keep.splice(k, 1); resolve(r); }
			u.onstart = function () { started = true; };
			u.onend = function () { end("done"); };
			u.onerror = function (e) { end(e && /not-allowed/.test(e.error) ? "blocked" : started ? "done" : "failed"); };
			keep.push(u);
			// a speak() that never starts (engine busy, voice data missing) must not hang the alert: give up after 4 s, or after the text's length once it started
			var t = setTimeout(function () { if (!started) { try { synth.cancel(); } catch (e) {} end("failed"); } else t = setTimeout(function () { end("done"); }, 4000 + text.length * 120); }, 4000);
			try { if (synth.paused) synth.resume(); synth.speak(u); } catch (e) { end("failed"); }
		});
	}
	function stop() { try { if (ok) synth.cancel(); } catch (e) {} }
	function voiceSelect(sel, key, onChange) {
		if (!sel) return;
		function fillSel() {
			var list = voices().slice().sort(function (a, b) { return String(a.lang).localeCompare(String(b.lang)) || a.name.localeCompare(b.name); });
			var cur = sel.value || key || "";
			sel.innerHTML = '<option value="">Automatic (best voice for your language)</option>' + list.map(function (v) {
				var k = voiceKey(v); return '<option value="' + k.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '">' + (v.name + " (" + v.lang + ")" + (v.localService ? "" : " · online")).replace(/</g, "&lt;") + "</option>";
			}).join("");
			sel.value = cur; if (sel.value !== cur) sel.value = "";
		}
		fillSel();
		if (ok && synth.addEventListener) synth.addEventListener("voiceschanged", fillSel); else if (ok) synth.onvoiceschanged = fillSel;
		sel.addEventListener("change", function () { if (onChange) onChange(sel.value); });
		if (window.MESVoicePicker) { try { window.MESVoicePicker.enhance(sel, { sample: "Reminder: your appointment starts in 30 minutes." }); } catch (e) {} }
	}
	function armNote(el, needFn) {
		if (!el) return;
		function upd() { el.hidden = activated() || !needFn(); }
		upd();
		["pointerdown", "keydown", "touchend"].forEach(function (ev) { document.addEventListener(ev, function () { setTimeout(upd, 0); }, true); });
		setInterval(upd, 3000);
	}
	function leaveGuard(fn) {
		window.addEventListener("beforeunload", function (e) {
			var on = false; try { on = !!fn(); } catch (x) {}
			if (!on) return;
			e.preventDefault(); e.returnValue = "A reminder or timer is still set on this page. If you close it, it will not ring."; return e.returnValue;
		});
	}
	window.MESSay = { ok: ok, speak: speak, stop: stop, activated: activated, fill: fill, voiceSelect: voiceSelect, armNote: armNote, leaveGuard: leaveGuard, voices: voices };
})(this);
