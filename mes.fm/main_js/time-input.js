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
	var CSS = ".mes-time{position:relative;display:block}.mes-time>input.mes-time__in{width:100%;box-sizing:border-box;padding-right:5.4em}" +
		".mes-time__pick{position:absolute;right:3.3em;top:50%;transform:translateY(-50%);font:inherit;font-size:0.8em;line-height:1;padding:0.4em 0.45em;border:0;border-radius:0.4em;background:none;color:#555;cursor:pointer}.mes-time__pick:hover,.mes-time__pick[aria-expanded=true]{background:#eef2f6;color:#277bb6}" +
		".mes-time__menu{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;max-height:15em;overflow-y:auto;background:#fff;border:1px solid #c3c9d2;border-radius:0.5em;box-shadow:0 0.4em 1.2em rgba(0,0,0,0.18);display:grid;grid-template-columns:repeat(auto-fill,minmax(5.5em,1fr));gap:2px;padding:4px}" +
		".mes-time__menu[hidden]{display:none}.mes-time__menu button{font:inherit;font-size:0.92em;border:0;border-radius:0.35em;background:none;color:#333;padding:0.45em 0.3em;cursor:pointer;text-align:center}.mes-time__menu button:hover,.mes-time__menu button:focus{background:#eef2f6;outline:none}.mes-time__menu button[aria-selected=true]{background:#277bb6;color:#fff}" +
		"body.dark-mode .mes-time__pick{color:#ccc}body.dark-mode .mes-time__pick:hover,body.dark-mode .mes-time__pick[aria-expanded=true]{background:#333;color:#8cc8ff}body.dark-mode .mes-time__menu{background:#222;border-color:#555}body.dark-mode .mes-time__menu button{color:#ddd}body.dark-mode .mes-time__menu button:hover,body.dark-mode .mes-time__menu button:focus{background:#333}body.dark-mode .mes-time__menu button[aria-selected=true]{background:#6cb6f5;color:#111}" +
		".mes-time__sw{position:absolute;right:0.35em;top:50%;transform:translateY(-50%);font:inherit;font-size:0.72em;font-weight:700;line-height:1;padding:0.45em 0.6em;border-radius:1em;border:1px solid #c3c9d2;background:#f4f6f9;color:#444;cursor:pointer}" +
		".mes-time__sw:hover{border-color:#277bb6;color:#277bb6}.mes-time__in.mes-time--bad{border-color:#c0262d !important;box-shadow:0 0 0 2px rgba(192,38,45,0.18)}" +
		"body.dark-mode .mes-time__sw{background:#2a2a2a;color:#ddd;border-color:#555}body.dark-mode .mes-time__sw:hover{color:#8cc8ff;border-color:#8cc8ff}";

	function enhance(orig) {
		if (orig.__mesTime || orig.hasAttribute("data-native-time")) return;
		orig.__mesTime = true;
		var withSec = orig.step && +orig.step < 60;
		var wrap = document.createElement("span"); wrap.className = "mes-time";
		var vis = document.createElement("input"); vis.type = "text"; vis.className = (orig.className + " mes-time__in").trim();
		vis.id = (orig.id || "mes-time-" + fields.length) + "-text"; vis.autocomplete = "off"; vis.spellcheck = false; vis.setAttribute("enterkeyhint", "done");
		vis.setAttribute("aria-describedby", vis.id + "-hint");
		var pick = document.createElement("button"); pick.type = "button"; pick.className = "mes-time__pick"; pick.innerHTML = "&#9662;"; pick.title = "Pick a time from a list"; pick.setAttribute("aria-label", pick.title); pick.setAttribute("aria-expanded", "false"); pick.setAttribute("aria-haspopup", "listbox");
		var menu = document.createElement("div"); menu.className = "mes-time__menu"; menu.hidden = true; menu.setAttribute("role", "listbox"); menu.setAttribute("aria-label", "Times");
		var sw = document.createElement("button"); sw.type = "button"; sw.className = "mes-time__sw";
		var hint = document.createElement("span"); hint.id = vis.id + "-hint"; hint.hidden = true; hint.textContent = "Type a time such as 18:30 or 6:30 pm";
		orig.parentNode.insertBefore(wrap, orig); wrap.appendChild(vis); wrap.appendChild(pick); wrap.appendChild(sw); wrap.appendChild(menu); wrap.appendChild(hint); wrap.appendChild(orig);
		orig.hidden = true; orig.tabIndex = -1;
		if (orig.id) Array.prototype.forEach.call(document.querySelectorAll('label[for="' + orig.id + '"]'), function (l) { l.htmlFor = vis.id; });
		// mirror programmatic writes to the hidden input
		var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
		Object.defineProperty(orig, "value", { configurable: true, get: function () { return d.get.call(orig); }, set: function (v) { d.set.call(orig, v); show(); } });
		function show() { if (document.activeElement !== vis) { vis.value = format(d.get.call(orig), H24, withSec); vis.classList.remove("mes-time--bad"); } }
		function label() { sw.textContent = H24 ? "24h" : "12h"; sw.title = H24 ? "Showing 24-hour time: switch to AM / PM" : "Showing AM / PM: switch to 24-hour time"; sw.setAttribute("aria-label", sw.title); vis.placeholder = H24 ? (withSec ? "18:30:00" : "18:30") : "6:30 PM"; if (!menu.hidden) fill(); }
		// the time list: every half hour, the one nearest the current value marked and scrolled into view
		function fill() {
			var cur = parse(vis.value, withSec) || d.get.call(orig), cm = cur ? +cur.slice(0, 2) * 60 + +cur.slice(3, 5) : 12 * 60, html = "";
			for (var i = 0; i < 48; i++) { var v = pad(Math.floor(i / 2)) + ":" + (i % 2 ? "30" : "00") + (withSec ? ":00" : ""); html += '<button type="button" role="option" tabindex="-1" data-v="' + v + '" aria-selected="' + (Math.floor(cm / 30) === i) + '">' + format(v, H24, withSec) + "</button>"; }
			menu.innerHTML = html;
			var sel = menu.querySelector('[aria-selected="true"]'); if (sel) menu.scrollTop = sel.offsetTop - menu.clientHeight / 2 + sel.offsetHeight / 2;
		}
		function open(on) {
			menu.hidden = !on; pick.setAttribute("aria-expanded", String(!!on));
			if (on) { fill(); document.addEventListener("pointerdown", away, true); } else document.removeEventListener("pointerdown", away, true);
		}
		function away(e) { if (!wrap.contains(e.target)) open(false); }
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
		pick.addEventListener("click", function () { open(menu.hidden); if (!menu.hidden) { var b = menu.querySelector('[aria-selected="true"]') || menu.firstChild; b && b.focus({ preventScroll: true }); } });
		menu.addEventListener("click", function (e) {
			var b = e.target.closest("[data-v]"); if (!b) return; var v = b.getAttribute("data-v");
			vis.value = format(v, H24, withSec); vis.classList.remove("mes-time--bad"); open(false); vis.focus();
			if (d.get.call(orig) !== v) { d.set.call(orig, v); fire(); }
		});
		menu.addEventListener("keydown", function (e) {
			var bs = Array.prototype.slice.call(menu.children), i = bs.indexOf(document.activeElement), cols = Math.max(1, Math.round(menu.clientWidth / (bs[0] ? bs[0].offsetWidth : 1)));
			var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
			if (step) { e.preventDefault(); var n = bs[Math.min(bs.length - 1, Math.max(0, i + step))]; n && n.focus(); }
			else if (e.key === "Escape") { e.preventDefault(); open(false); vis.focus(); }
			else if (e.key === "Tab") open(false);
		});
		vis.addEventListener("keydown", function (e) {
			if (e.key === "Escape" && !menu.hidden) { open(false); return; }
			if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); pick.click(); return; }
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
