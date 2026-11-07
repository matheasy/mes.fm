/* MES tab progress (2026-11-07): shows a long job's progress in the browser tab while you work in another tab.
 * The tab title becomes "24% · 18:47 left · Compressing Halloween Spooks.mp4" and the tab icon a small progress ring; when the job ends
 * the title says "✓ Done" (or "✗ Stopped") until you come back to the tab, then everything goes back to normal.
 *
 *   var tp = MESTabProgress.task("Compressing Halloween Spooks.mp4");
 *   (the tab is only touched once a job has run 2.5 s: task(label, {delay: ms}) changes that)
 *   tp.set(0.24);                 // fraction 0..1; time left is worked out from the start time
 *   tp.set(0.24, "File 1 of 3");  // optional extra words
 *   tp.done("6.1 GB -> 1.2 GB");  // or tp.fail("Cancelled"), or tp.stop() (silently back to normal)
 *   MESTabProgress.checkbox()     // HTML for the "Show progress in the browser tab" tick box (on by default, remembered for every MES tool)
 *
 * Off = localStorage "mes-tabprogress" is "0". Shared by every MES tool, so turning it off on one page turns it off everywhere. */
(function () {
	if (window.MESTabProgress) return;
	var KEY = "mes-tabprogress", cur = null, baseTitle = null, baseIcons = null, ringLink = null, endTimer = 0;
	function on() { try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; } }
	function setOn(v) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) { /* ignore */ } document.querySelectorAll("input.mes-tp-ck").forEach(function (b) { b.checked = !!v; }); if (!v) restore(); else if (cur) paint(cur, true); }
	function fmt(s) {
		s = Math.max(0, Math.round(s)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
		return h ? h + ":" + (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x : m + ":" + (x < 10 ? "0" : "") + x;
	}
	function save() {
		if (baseTitle != null) return;
		baseTitle = document.title;
		baseIcons = [].slice.call(document.querySelectorAll("link[rel~='icon']")).map(function (l) { return { el: l, href: l.getAttribute("href") }; });
	}
	function restore() {
		clearTimeout(endTimer);
		if (baseTitle == null) return;
		document.title = baseTitle; baseTitle = null;
		if (ringLink) { ringLink.remove(); ringLink = null; }
		(baseIcons || []).forEach(function (b) { if (!b.el.isConnected) document.head.appendChild(b.el); });
		baseIcons = null;
	}
	function ring(frac, state) {
		var c = document.createElement("canvas"); c.width = c.height = 64; var g = c.getContext("2d");
		g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.lineWidth = 10; g.strokeStyle = "rgba(128,128,128,0.35)"; g.stroke();
		var col = state === "done" ? "#16a34a" : state === "fail" ? "#dc2626" : "#2563eb";
		g.beginPath(); g.arc(32, 32, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (state ? 1 : Math.max(0.02, frac))); g.strokeStyle = col; g.lineWidth = 10; g.lineCap = "round"; g.stroke();
		if (state) { g.strokeStyle = col; g.lineWidth = 8; g.lineCap = "round"; g.beginPath(); if (state === "done") { g.moveTo(20, 33); g.lineTo(29, 42); g.lineTo(45, 23); } else { g.moveTo(22, 22); g.lineTo(42, 42); g.moveTo(42, 22); g.lineTo(22, 42); } g.stroke(); }
		return c.toDataURL("image/png");
	}
	function icon(frac, state) {
		// browsers use the last icon link, and some only notice a change when a new link is added, so the old ones are taken out while the ring shows
		(baseIcons || []).forEach(function (b) { if (b.el.isConnected) b.el.remove(); });
		if (!ringLink) { ringLink = document.createElement("link"); ringLink.rel = "icon"; ringLink.type = "image/png"; }
		ringLink.href = ring(frac, state); if (!ringLink.isConnected) document.head.appendChild(ringLink);
	}
	function paint(t, force) {
		if (!on() || t !== cur) return;
		var now = Date.now(); if (now - t.start < t.delay) { if (!t.timer) t.timer = setTimeout(function () { t.timer = 0; paint(t, true); }, t.delay - (now - t.start) + 20); return; } if (!force && now - t.last < 900) return; t.last = now; t.shown = true;
		save();
		var pct = Math.floor(Math.max(0, Math.min(1, t.frac)) * 100), el = (now - t.start) / 1000, left = t.frac > 0.02 && el > 3 ? el / t.frac - el : null;
		document.title = pct + "%" + (left != null ? " · " + fmt(left) + " left" : "") + " · " + t.label + (t.extra ? " (" + t.extra + ")" : "");
		icon(t.frac, null);
	}
	function finish(t, state, msg) {
		if (t !== cur) return; cur = null; clearTimeout(t.timer);
		if (!on() || !t.shown) { restore(); return; }   // a job that ended within a couple of seconds never touched the tab
		save();
		document.title = (state === "done" ? "✓ Done" : "✗ " + (msg || "Stopped")) + " · " + t.label + (state === "done" && msg ? " (" + msg + ")" : "");
		icon(1, state);
		// leave the result up until the person has looked at this tab, then put the page's own title and icon back
		var later = function () { endTimer = setTimeout(function () { if (!cur) restore(); }, 6000); };
		if (document.visibilityState === "visible" && document.hasFocus()) later();
		else { var back = function () { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); later(); } }; document.addEventListener("visibilitychange", back); window.addEventListener("focus", back); }
	}
	function task(label, opt) {
		clearTimeout(endTimer); if (cur) clearTimeout(cur.timer);
		var t = { label: String(label || "Working"), frac: 0, extra: "", start: Date.now(), last: 0, delay: opt && opt.delay != null ? opt.delay : 2500, shown: false, timer: 0 };
		cur = t; paint(t, true);
		return {
			set: function (frac, extra) { if (isFinite(frac)) t.frac = frac; if (extra != null) t.extra = extra; paint(t); },
			label: function (l) { t.label = String(l); paint(t, true); },
			done: function (msg) { finish(t, "done", msg); },
			fail: function (msg) { finish(t, "fail", msg); },
			stop: function () { if (t === cur) { cur = null; clearTimeout(t.timer); restore(); } }
		};
	}
	function checkbox(text) {
		return '<label class="mes-tp" title="While this runs, the browser tab shows the percent done and the time left, so you can work in other tabs. Remembered for every MES tool."><input type="checkbox" class="mes-tp-ck"' + (on() ? " checked" : "") + "> " + (text || "Show progress in the browser tab") + "</label>";
	}
	document.addEventListener("change", function (e) { if (e.target && e.target.classList && e.target.classList.contains("mes-tp-ck")) setOn(e.target.checked); });
	window.addEventListener("storage", function (e) { if (e.key === KEY) document.querySelectorAll("input.mes-tp-ck").forEach(function (b) { b.checked = on(); }); });
	function sync() { document.querySelectorAll("input.mes-tp-ck").forEach(function (b) { b.checked = on(); }); }
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync); else sync();
	window.MESTabProgress = { task: task, checkbox: checkbox, enabled: on, setEnabled: setOn, fmt: fmt };
})();
