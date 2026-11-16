/* MES searchable select: turns any long native <select> into a button + popover with a type-to-search box (accent-insensitive, matches the
   option text, its value and an optional data-search="aliases" attribute), optgroup headings, arrow keys / Enter / Esc, light + dark.
   The <select> stays the source of truth: the page keeps filling it, reading .value and listening for "change"; this only mirrors it
   (a MutationObserver rebuilds the list, a setter-free poll keeps the button label in step when a script sets .value).
   Site rule: any list with 10 or more choices gets a search box.
     MESSelect.enhance(select, {placeholder: "Search countries…", noun: "countries"})
     MESSelect.auto(root, min = 10)   enhances every select under root with >= min options (skip one with data-native) */
(function () {
	"use strict";
	if (window.MESSelect) return;
	var CSS = ".ss-native{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
		".ss{position:relative;display:inline-block;max-width:100%;min-width:12em;vertical-align:middle}" +
		".ss-btn{display:flex;align-items:center;justify-content:space-between;gap:.6em;width:100%;box-sizing:border-box;text-align:left;font:inherit;padding:.45em .7em;border:1px solid #b9c1cc;border-radius:.4em;background:#fff;color:#222;cursor:pointer}" +
		".ss-btn:hover,.ss-btn[aria-expanded=true]{border-color:var(--accent,#2563eb)}" +
		".ss-btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ss-btn i{font-style:normal;opacity:.6;flex:none}" +
		".ss-panel{position:absolute;z-index:70;left:0;top:calc(100% + 4px);background:#fff;color:#222;border:1px solid #b9c1cc;border-radius:.5em;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:.5em;width:max(100%,min(20em,92vw));box-sizing:border-box}" +
		".ss-panel.ss-up{top:auto;bottom:calc(100% + 4px)}.ss-panel[hidden]{display:none}" +
		".ss-search{display:block;width:100%;box-sizing:border-box;font:inherit;padding:.45em .7em;border:1px solid #b9c1cc;border-radius:.4em;background:#fff;color:#222}" +
		".ss-count{font-size:.8em;color:#5f6773;margin:.35em .2em}" +
		".ss-list{max-height:16em;overflow:auto;margin:0;padding:0;list-style:none}" +
		".ss-group{font-size:.75em;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5f6773;padding:.5em .4em .15em;position:sticky;top:0;background:#fff}" +
		".ss-opt{padding:.35em .5em;border-radius:.3em;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
		".ss-opt:hover,.ss-opt.ss-act{background:rgba(37,99,235,.12)}.ss-opt[aria-selected=true]{font-weight:700}" +
		".ss-opt[aria-selected=true]::before{content:'\\2713  ';}" +
		".ss-empty{padding:.6em .4em;color:#5f6773;font-style:italic}" +
		"body.dark-mode .ss-btn,body.dark-mode .ss-panel,body.dark-mode .ss-search,body.dark-mode .ss-group{background:#2a2a2a;color:#eee;border-color:#555}" +
		"body.dark-mode .ss-count,body.dark-mode .ss-group,body.dark-mode .ss-empty{color:#b4b8c4}" +
		"body.dark-mode .ss-opt{color:#eee}body.dark-mode .ss-opt:hover,body.dark-mode .ss-opt.ss-act{background:rgba(108,182,245,.22)}";
	var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);

	function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
	function fold(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

	function enhance(sel, opts) {
		if (!sel || sel.__ss) return; sel.__ss = true;
		opts = opts || {};
		var noun = opts.noun || "choices";
		var wrap = el("div", "ss"), btn = el("button", "ss-btn"), btnTxt = el("span"), caret = el("i", "", "▾");
		btn.type = "button"; btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
		btn.appendChild(btnTxt); btn.appendChild(caret);
		var panel = el("div", "ss-panel"); panel.hidden = true;
		var search = el("input", "ss-search"); search.type = "search"; search.placeholder = opts.placeholder || "Type to search…";
		search.setAttribute("aria-label", opts.placeholder || "Search"); search.autocomplete = "off"; search.spellcheck = false;
		var count = el("div", "ss-count"), list = el("ul", "ss-list"); list.setAttribute("role", "listbox");
		panel.appendChild(search); panel.appendChild(count); panel.appendChild(list);
		wrap.appendChild(btn); wrap.appendChild(panel);
		sel.parentNode.insertBefore(wrap, sel.nextSibling);
		sel.classList.add("ss-native"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
		if (sel.id) { var lab = document.querySelector('label[for="' + sel.id + '"]'); if (lab) { if (!lab.id) lab.id = sel.id + "-lab"; btn.setAttribute("aria-labelledby", lab.id + " " + (btnTxt.id = sel.id + "-ssv")); lab.addEventListener("click", function (e) { e.preventDefault(); toggle(true); }); } }

		var rows = [], active = -1, lastLabel = null;
		function label() { var o = sel.options[sel.selectedIndex], t = o ? o.textContent : ""; if (t !== lastLabel) { btnTxt.textContent = t; lastLabel = t; } }
		function build() {
			rows = [];
			Array.prototype.forEach.call(sel.children, function (c) {
				var add = function (o, g) { rows.push({ value: o.value, text: o.textContent, group: g, disabled: o.disabled, hay: fold(o.textContent + " " + o.value + " " + (o.getAttribute("data-search") || "")) }); };
				if (c.tagName === "OPTGROUP") Array.prototype.forEach.call(c.children, function (o) { add(o, c.label); });
				else if (c.tagName === "OPTION") add(c, "");
			});
			label(); if (!panel.hidden) render();
		}
		function render() {
			list.innerHTML = ""; active = -1;
			var words = fold(search.value).split(/\s+/).filter(Boolean), shown = 0, lastG = null;
			rows.forEach(function (r, i) {
				if (r.disabled) return;
				if (words.length && !words.every(function (w) { return r.hay.indexOf(w) >= 0; })) return;
				if (r.group && r.group !== lastG) { list.appendChild(el("li", "ss-group", r.group)); }
				lastG = r.group;
				var li = el("li", "ss-opt", r.text); li.setAttribute("role", "option"); li.dataset.i = i;
				li.setAttribute("aria-selected", r.value === sel.value ? "true" : "false");
				list.appendChild(li); shown++;
			});
			var total = rows.filter(function (r) { return !r.disabled; }).length;
			count.textContent = words.length ? shown + " of " + total + " " + noun + " match" : total + " " + noun;
			if (!shown) list.appendChild(el("li", "ss-empty", "Nothing matches “" + search.value + "”."));
			var opts2 = list.querySelectorAll(".ss-opt");
			if (words.length && opts2.length) setActive(0);
			else for (var k = 0; k < opts2.length; k++) if (opts2[k].getAttribute("aria-selected") === "true") { setActive(k, true); break; }
		}
		function setActive(k, center) {
			var o = list.querySelectorAll(".ss-opt"); if (!o.length) return;
			k = Math.max(0, Math.min(o.length - 1, k));
			if (o[active]) o[active].classList.remove("ss-act");
			active = k; o[k].classList.add("ss-act");
			if (center) list.scrollTop = o[k].offsetTop - list.clientHeight / 2; else o[k].scrollIntoView({ block: "nearest" });
		}
		function toggle(open) {
			if (open === undefined) open = panel.hidden;
			panel.hidden = !open; btn.setAttribute("aria-expanded", open ? "true" : "false");
			if (open) {
				search.value = ""; render();
				var r = btn.getBoundingClientRect(); panel.classList.toggle("ss-up", window.innerHeight - r.bottom < 320 && r.top > window.innerHeight - r.bottom);
				search.focus();
			}
		}
		function choose(i) {
			var r = rows[i]; if (!r) return;
			toggle(false); btn.focus();
			if (sel.value !== r.value) { sel.value = r.value; sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); }
			label();
		}
		btn.addEventListener("click", function () { toggle(); });
		btn.addEventListener("keydown", function (e) {
			if (e.key === "ArrowDown" || e.key === "ArrowUp" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ")) {
				e.preventDefault(); toggle(true); if (e.key.length === 1) { search.value = e.key; render(); }
			}
		});
		search.addEventListener("input", render);
		list.addEventListener("click", function (e) { var li = e.target.closest(".ss-opt"); if (li) choose(+li.dataset.i); });
		panel.addEventListener("keydown", function (e) {
			var o = list.querySelectorAll(".ss-opt");
			if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
			else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
			else if (e.key === "PageDown") { e.preventDefault(); setActive(active + 8); }
			else if (e.key === "PageUp") { e.preventDefault(); setActive(active - 8); }
			else if (e.key === "Enter") { e.preventDefault(); if (o[active]) choose(+o[active].dataset.i); }
			else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); toggle(false); btn.focus(); }
			else if (e.key === "Tab") toggle(false);
		});
		document.addEventListener("pointerdown", function (e) { if (!panel.hidden && !wrap.contains(e.target)) toggle(false); });
		sel.addEventListener("change", label);
		var queued = false;
		new MutationObserver(function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; build(); }); }).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["selected", "disabled", "label"] });
		setInterval(function () { if (!document.hidden) label(); }, 700);   // a script setting .value changes nothing in the DOM
		build();
	}
	function auto(root, min) {
		min = min || 10;
		Array.prototype.forEach.call((root || document).querySelectorAll("select:not([multiple]):not([data-native])"), function (s) { if (s.options.length >= min) enhance(s); });
	}
	window.MESSelect = { enhance: enhance, auto: auto };
})();
