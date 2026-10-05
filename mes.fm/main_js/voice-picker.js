/* MES voice picker: turns a native <select> of speech voices into a searchable list (name, language, country, "online"/"on device"),
   with a preview button per voice. The <select> stays the source of truth: the page keeps filling it, reading .value and listening for
   "change"; this only mirrors it. Option values are  (voiceURI || name) + "|" + lang  (the same key the page uses), which is how the
   preview finds the voice. Used by mes.fm/speedreader and mes.fm/typing-test-transcribe.
   window.MESVoicePicker.enhance(select, { sample: "Hello, ..." }) */
(function () {
	"use strict";
	if (window.MESVoicePicker) return;
	var CSS = ".vp-native{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
		".vp{position:relative;max-width:100%}" +
		".vp-btn{display:flex;align-items:center;justify-content:space-between;gap:.6em;width:100%;box-sizing:border-box;text-align:left;font:inherit;padding:.5em .7em;border:1px solid #b9c1cc;border-radius:.4em;background:#fff;color:#222;cursor:pointer}" +
		".vp-btn:hover,.vp-btn[aria-expanded=true]{border-color:var(--accent,#2563eb)}" +
		".vp-btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vp-btn i{font-style:normal;opacity:.6;flex:none}" +
		".vp-panel{position:absolute;z-index:60;left:0;right:0;top:calc(100% + 4px);background:#fff;color:#222;border:1px solid #b9c1cc;border-radius:.5em;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:.5em;min-width:min(22em,92vw)}" +
		".vp-panel[hidden]{display:none}" +
		".vp-search{display:block;width:100%;box-sizing:border-box;font:inherit;padding:.5em .7em;border:1px solid #b9c1cc;border-radius:.4em;background:#fff;color:#222}" +
		".vp-count{font-size:.8em;color:#6a7280;margin:.35em .2em}" +
		".vp-list{max-height:16em;overflow:auto;margin:0;padding:0;list-style:none}" +
		".vp-group{font-size:.75em;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6a7280;padding:.5em .4em .15em;position:sticky;top:0;background:#fff}" +
		".vp-opt{display:flex;align-items:center;gap:.4em;padding:.3em .4em;border-radius:.3em;cursor:pointer}" +
		".vp-opt:hover,.vp-opt.vp-act{background:rgba(37,99,235,.12)}.vp-opt[aria-selected=true]{font-weight:700}" +
		".vp-opt .vp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
		".vp-opt .vp-tag{font-size:.75em;color:#6a7280}" +
		".vp-play{flex:none;border:1px solid #b9c1cc;background:#fff;color:#333;border-radius:1em;width:1.9em;height:1.9em;line-height:1;cursor:pointer;font-size:.8em;padding:0}" +
		".vp-play:hover{border-color:var(--accent,#2563eb);color:var(--accent,#2563eb)}" +
		".vp-empty{padding:.6em .4em;color:#6a7280;font-style:italic}" +
		"body.dark-mode .vp-btn,body.dark-mode .vp-panel,body.dark-mode .vp-search,body.dark-mode .vp-play,body.dark-mode .vp-group{background:#2a2a2a;color:#eee;border-color:#555}" +
		"body.dark-mode .vp-count,body.dark-mode .vp-group,body.dark-mode .vp-opt .vp-tag,body.dark-mode .vp-empty{color:#aab}" +
		"body.dark-mode .vp-opt:hover,body.dark-mode .vp-opt.vp-act{background:rgba(108,182,245,.2)}";
	var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);

	function keyOf(v) { return (v.voiceURI || v.name) + "|" + v.lang; }
	function voiceByKey(key) {
		var list = []; try { list = speechSynthesis.getVoices() || []; } catch (e) {}
		for (var i = 0; i < list.length; i++) if (keyOf(list[i]) === key) return list[i];
		return null;
	}
	function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

	function enhance(sel, opts) {
		if (!sel || sel.__vp) return; sel.__vp = true;
		opts = opts || {};
		var wrap = el("div", "vp"), btn = el("button", "vp-btn"), btnTxt = el("span"), caret = el("i", "", "▾");
		btn.type = "button"; btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
		btn.appendChild(btnTxt); btn.appendChild(caret);
		var panel = el("div", "vp-panel"); panel.hidden = true;
		var search = el("input", "vp-search"); search.type = "search"; search.placeholder = "Search voices: name, language, country…"; search.setAttribute("aria-label", "Search voices"); search.autocomplete = "off"; search.spellcheck = false;
		var count = el("div", "vp-count"), list = el("ul", "vp-list"); list.setAttribute("role", "listbox");
		panel.appendChild(search); panel.appendChild(count); panel.appendChild(list);
		wrap.appendChild(btn); wrap.appendChild(panel);
		sel.parentNode.insertBefore(wrap, sel.nextSibling);
		sel.classList.add("vp-native"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
		var lab = sel.id && document.querySelector('label[for="' + sel.id + '"]');
		if (lab) lab.addEventListener("click", function (e) { e.preventDefault(); toggle(true); });

		var rows = [], active = -1;
		function label() { var o = sel.options[sel.selectedIndex]; btnTxt.textContent = o ? o.textContent : "Loading voices…"; }
		function build() {
			rows = [];
			Array.prototype.forEach.call(sel.children, function (c) {
				if (c.tagName === "OPTGROUP") Array.prototype.forEach.call(c.children, function (o) { rows.push({ value: o.value, text: o.textContent, group: c.label, o: o }); });
				else if (c.tagName === "OPTION") rows.push({ value: c.value, text: c.textContent, group: "", o: c, disabled: c.disabled });
			});
			label(); if (!panel.hidden) render();
		}
		function render() {
			var words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean), shown = 0, lastG = null;
			list.innerHTML = ""; active = -1;
			rows.forEach(function (r) {
				if (r.disabled) return;
				var hay = (r.text + " " + r.group + " " + r.value.split("|").pop()).toLowerCase();
				if (r.value !== "auto" && !words.every(function (w) { return hay.indexOf(w) >= 0; })) return;
				if (r.value === "auto" && words.length) return;
				if (r.group !== lastG && r.group) { lastG = r.group; var g = el("li", "vp-group", r.group); g.setAttribute("role", "presentation"); list.appendChild(g); }
				var li = el("li", "vp-opt"); li.setAttribute("role", "option"); li.dataset.v = r.value; li.setAttribute("aria-selected", String(r.value === sel.value));
				var nm = el("span", "vp-name", r.text); li.appendChild(nm);
				if (r.value !== "auto") { var p = el("button", "vp-play", "▶"); p.type = "button"; p.title = "Hear this voice"; p.setAttribute("aria-label", "Hear " + r.text); p.dataset.v = r.value; li.appendChild(p); }
				list.appendChild(li); if (r.value !== "auto") shown++;
			});
			var total = rows.filter(function (r) { return !r.disabled && r.value !== "auto"; }).length;
			count.textContent = total ? shown + (words.length ? " of " + total + " voices match" : " voices") : "No voices found on this device yet.";
			if (!shown && total) { var em = el("li", "vp-empty", "No voice matches “" + search.value + "”."); list.appendChild(em); }
		}
		function toggle(open) {
			if (open === undefined) open = panel.hidden;
			panel.hidden = !open; btn.setAttribute("aria-expanded", String(open));
			if (open) { search.value = ""; render(); var cur = list.querySelector('[aria-selected="true"]'); if (cur) cur.scrollIntoView({ block: "center" }); search.focus({ preventScroll: true }); }
			else { try { speechSynthesis.cancel(); } catch (e) {} }
		}
		function choose(v) {
			sel.value = v; label(); toggle(false);
			sel.dispatchEvent(new Event("change", { bubbles: true })); btn.focus();
		}
		function preview(key) {
			if (!("speechSynthesis" in window)) return;
			var v = voiceByKey(key); try { speechSynthesis.cancel(); } catch (e) {}
			var u = new SpeechSynthesisUtterance(opts.sample || "Hello, this is how I sound."); if (v) { u.voice = v; u.lang = v.lang; }
			try { speechSynthesis.speak(u); } catch (e) {}
		}
		btn.addEventListener("click", function () { toggle(); });
		search.addEventListener("input", render);
		list.addEventListener("click", function (e) {
			var p = e.target.closest(".vp-play"); if (p) { e.stopPropagation(); preview(p.dataset.v); return; }
			var li = e.target.closest(".vp-opt"); if (li) choose(li.dataset.v);
		});
		function move(d) {
			var opts2 = Array.prototype.slice.call(list.querySelectorAll(".vp-opt")); if (!opts2.length) return;
			if (active >= 0 && opts2[active]) opts2[active].classList.remove("vp-act");
			active = Math.max(0, Math.min(opts2.length - 1, active + d)); opts2[active].classList.add("vp-act"); opts2[active].scrollIntoView({ block: "nearest" });
		}
		panel.addEventListener("keydown", function (e) {
			if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); toggle(false); btn.focus(); }
			else if (e.key === "ArrowDown") { e.preventDefault(); move(active < 0 ? 1 : 1); }
			else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
			else if (e.key === "Enter") { e.preventDefault(); var o = list.querySelectorAll(".vp-opt")[active >= 0 ? active : 0]; if (o) choose(o.dataset.v); }
		});
		document.addEventListener("pointerdown", function (e) { if (!panel.hidden && !wrap.contains(e.target)) toggle(false); });
		var queued = false;
		new MutationObserver(function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; build(); }); }).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["selected", "disabled"] });
		sel.addEventListener("change", label);
		setInterval(function () { if (!document.hidden) label(); }, 800);   // a script setting .value changes nothing in the DOM
		build();
	}
	window.MESVoicePicker = { enhance: enhance };
})();
