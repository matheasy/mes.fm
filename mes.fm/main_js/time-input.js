/* MES time fields (2026-10-21): a native <input type="time"> always shows the browser's own 12 / 24 hour style. This swaps each one
 * for a text field that accepts either ("18:30", "6:30 pm", "6.30p", "1830", "noon") with a small 12h / 24h switch inside it (the
 * choice is shared site-wide: localStorage "mes-time24") and a list of suggestions. The original input stays in the page, hidden,
 * and keeps its id and HH:MM(:SS) value, so page scripts read / set it and listen to it exactly as before (input + change are
 * dispatched on it). Opt out with data-native-time. Node: require('./mes.fm/main_js/time-input.js').parse("6pm") -> "18:00".
 */
(function (root) {
	"use strict";
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	// text -> "HH:MM" or "HH:MM:SS" (when withSec), or "" if it is not a time
	function parse(text, withSec) {
		var t = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
		if (!t) return "";
		if (/^(noon|midday)$/.test(t)) return withSec ? "12:00:00" : "12:00";
		if (/^midnight$/.test(t)) return withSec ? "00:00:00" : "00:00";
		var m = /^(\d{1,2})(?:[:.h ]?(\d{2}))?(?:[:.](\d{2}))?\s*(a|p|am|pm|a\.m\.|p\.m\.)?$/.exec(t);
		if (!m) { var c = /^(\d{3,4})\s*(a|p|am|pm)?$/.exec(t); if (c) { var s = c[1].length === 3 ? "0" + c[1] : c[1]; m = [t, s.slice(0, 2), s.slice(2), null, c[2]]; } }
		if (!m) return "";
		var h = +m[1], mi = m[2] ? +m[2] : 0, se = m[3] ? +m[3] : 0, ap = m[4] ? m[4].charAt(0) : "";
		if (mi > 59 || se > 59) return "";
		if (ap) { if (h < 1 || h > 12) return ""; h = h % 12 + (ap === "p" ? 12 : 0); }
		else if (h > 23) return "";
		return pad(h) + ":" + pad(mi) + (withSec ? ":" + pad(se) : "");
	}
	// "18:05" -> "6:05 PM" / "18:05" (seconds only when withSec)
	function format(v, h24, withSec) {
		var m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(v || ""); if (!m) return "";
		var h = +m[1], sec = withSec ? ":" + (m[3] || "00") : "";
		return h24 ? m[1] + ":" + m[2] + sec : (h % 12 || 12) + ":" + m[2] + sec + (h < 12 ? " AM" : " PM");
	}
	var API = { parse: parse, format: format };
	if (typeof module !== "undefined" && module.exports) { module.exports = API; return; }
	root.MESTime = API;

	var KEY = "mes-time24";
	function pref() {
		try { var v = localStorage.getItem(KEY); if (v === "1") return true; if (v === "0") return false; } catch (e) {}
		try { return new Intl.DateTimeFormat(navigator.language, { hour: "numeric" }).resolvedOptions().hour12 !== true; } catch (e) { return false; }
	}
	var H24 = pref(), fields = [];
	var CSS = ".mes-time{position:relative;display:block}.mes-time>input.mes-time__in{width:100%;box-sizing:border-box;padding-right:4.2em}" +
		".mes-time__sw{position:absolute;right:0.35em;top:50%;transform:translateY(-50%);font:inherit;font-size:0.72em;font-weight:700;line-height:1;padding:0.45em 0.6em;border-radius:1em;border:1px solid #c3c9d2;background:#f4f6f9;color:#444;cursor:pointer}" +
		".mes-time__sw:hover{border-color:#277bb6;color:#277bb6}.mes-time__in.mes-time--bad{border-color:#c0262d !important;box-shadow:0 0 0 2px rgba(192,38,45,0.18)}" +
		"body.dark-mode .mes-time__sw{background:#2a2a2a;color:#ddd;border-color:#555}body.dark-mode .mes-time__sw:hover{color:#8cc8ff;border-color:#8cc8ff}";

	function suggestions(list, withSec) {
		var o = [];
		for (var i = 0; i < 48; i++) { var v = pad(Math.floor(i / 2)) + ":" + (i % 2 ? "30" : "00"); o.push('<option value="' + format(v, H24) + '">'); }
		list.innerHTML = o.join("");
	}
	function enhance(orig) {
		if (orig.__mesTime || orig.hasAttribute("data-native-time")) return;
		orig.__mesTime = true;
		var withSec = orig.step && +orig.step < 60;
		var wrap = document.createElement("span"); wrap.className = "mes-time";
		var vis = document.createElement("input"); vis.type = "text"; vis.className = (orig.className + " mes-time__in").trim();
		vis.id = (orig.id || "mes-time-" + fields.length) + "-text"; vis.autocomplete = "off"; vis.spellcheck = false; vis.setAttribute("enterkeyhint", "done");
		vis.setAttribute("aria-describedby", vis.id + "-hint");
		var list = document.createElement("datalist"); list.id = vis.id + "-list"; vis.setAttribute("list", list.id);
		var sw = document.createElement("button"); sw.type = "button"; sw.className = "mes-time__sw";
		var hint = document.createElement("span"); hint.id = vis.id + "-hint"; hint.hidden = true; hint.textContent = "Type a time such as 18:30 or 6:30 pm";
		orig.parentNode.insertBefore(wrap, orig); wrap.appendChild(vis); wrap.appendChild(sw); wrap.appendChild(list); wrap.appendChild(hint); wrap.appendChild(orig);
		orig.hidden = true; orig.tabIndex = -1;
		if (orig.id) Array.prototype.forEach.call(document.querySelectorAll('label[for="' + orig.id + '"]'), function (l) { l.htmlFor = vis.id; });
		// mirror programmatic writes to the hidden input
		var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
		Object.defineProperty(orig, "value", { configurable: true, get: function () { return d.get.call(orig); }, set: function (v) { d.set.call(orig, v); show(); } });
		function show() { if (document.activeElement !== vis) { vis.value = format(d.get.call(orig), H24, withSec); vis.classList.remove("mes-time--bad"); } }
		function label() { sw.textContent = H24 ? "24h" : "AM/PM"; sw.title = H24 ? "Showing 24-hour time: switch to AM / PM" : "Showing AM / PM: switch to 24-hour time"; sw.setAttribute("aria-label", sw.title); vis.placeholder = H24 ? (withSec ? "18:30:00" : "18:30") : "6:30 PM"; suggestions(list, withSec); }
		function commit(final) {
			var raw = vis.value, v = parse(raw, withSec);
			if (!raw.trim()) { if (final) vis.classList.remove("mes-time--bad"); if (d.get.call(orig) !== "") { d.set.call(orig, ""); fire(); } return; }
			if (!v) { if (final) vis.classList.add("mes-time--bad"); return; }
			vis.classList.remove("mes-time--bad");
			if (final) vis.value = format(v, H24, withSec);
			if (d.get.call(orig) !== v) { d.set.call(orig, v); fire(); }
		}
		function fire() { orig.dispatchEvent(new Event("input", { bubbles: true })); orig.dispatchEvent(new Event("change", { bubbles: true })); }
		vis.addEventListener("input", function () { commit(false); });
		vis.addEventListener("change", function () { commit(true); });
		vis.addEventListener("blur", function () { commit(true); });
		vis.addEventListener("keydown", function (e) {
			if (e.key === "Enter") { commit(true); return; }
			if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
			var v = parse(vis.value, withSec) || d.get.call(orig) || "12:00"; e.preventDefault();
			var p = v.split(":"), mins = (+p[0] * 60 + +p[1] + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 60 : 15) + 1440) % 1440;
			mins = e.shiftKey ? mins : Math.round(mins / 15) * 15 % 1440;
			var nv = pad(Math.floor(mins / 60)) + ":" + pad(mins % 60) + (withSec ? ":" + (p[2] || "00") : "");
			vis.value = format(nv, H24, withSec); d.set.call(orig, nv); fire();
		});
		sw.addEventListener("click", function () {
			H24 = !H24; try { localStorage.setItem(KEY, H24 ? "1" : "0"); } catch (e) {}
			fields.forEach(function (f) { f(); });
		});
		fields.push(function () { label(); vis.value = format(d.get.call(orig), H24, withSec) || vis.value; });
		label(); vis.value = format(d.get.call(orig), H24, withSec);
	}
	function init() {
		if (!document.getElementById("mes-time-css")) { var s = document.createElement("style"); s.id = "mes-time-css"; s.textContent = CSS; document.head.appendChild(s); }
		Array.prototype.forEach.call(document.querySelectorAll('input[type="time"]'), enhance);
	}
	API.enhance = enhance;
	window.addEventListener("storage", function (e) { if (e.key === KEY) { H24 = pref(); fields.forEach(function (f) { f(); }); } });
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
