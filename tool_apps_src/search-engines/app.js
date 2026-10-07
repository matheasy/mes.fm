/* MES Search Engines -- mes.fm/search-engines
 * Type one search, tick engines (or pick a set), open them all at once in tabs or tiled windows, or click a single engine link.
 * Engine table + URL builder: lib.js (MESEngines). State: localStorage "mes-search-engines:v1" (ticked engines, Google/Bing/... variants, own engines and sets,
 * options, recent searches). Share links: ?q=&e=google,bing&t=images&w=d&m=tab&v=google:ca+co.uk&ex=site.com. Nothing is sent anywhere by this page.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("se");
	if (!root) return;
	var E = window.MESEngines, KEY = "mes-search-engines:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

	var saved = sget(), qs = new URLSearchParams(location.search);
	var S = {
		sel: Array.isArray(saved.sel) ? saved.sel : ["google", "bing", "ddg", "brave", "yahoo"],
		vsel: saved.vsel && typeof saved.vsel === "object" ? saved.vsel : {},
		custom: Array.isArray(saved.custom) ? saved.custom : [],
		sets: Array.isArray(saved.sets) ? saved.sets : [],
		type: saved.type || "web", time: saved.time || "", mode: saved.mode || "tab",
		exact: !!saved.exact, site: saved.site || "", excl: saved.excl || "", log: saved.log !== false, hist: Array.isArray(saved.hist) ? saved.hist : [],
		fold: saved.fold && typeof saved.fold === "object" ? saved.fold : {},
		extra: saved.extra && typeof saved.extra === "object" ? saved.extra : {}
	};
	// a shared link overrides the saved choices for this visit
	if (qs.get("e")) S.sel = qs.get("e").split(",").filter(function (id) { return E.BYID[id]; });
	if (/^(web|images|news|videos)$/.test(qs.get("t") || "")) S.type = qs.get("t");
	if (/^[dwmy]$/.test(qs.get("w") || "")) S.time = qs.get("w");
	if (/^(tab|window|same)$/.test(qs.get("m") || "")) S.mode = qs.get("m");
	if (qs.get("site")) S.site = qs.get("site");
	if (qs.get("ex")) S.excl = qs.get("ex");
	// v=google:ca+co.uk,bing:gb = the variants (Google domains, regions...) each shared engine had ticked
	if (qs.get("v")) { S.vsel = {}; qs.get("v").split(",").forEach(function (p) { var m = p.split(":"), e = E.BYID[m[0]]; if (e && e.variants && m[1]) { var ids = m[1].split(/[+ ]/).filter(function (v) { return e.variants.some(function (x) { return x.id === v; }); }); if (ids.length) S.vsel[m[0]] = ids; } }); }
	if (qs.get("x") === "1") S.exact = true;
	if (qs.get("a")) { S.extra = {}; qs.get("a").split(",").forEach(function (p) { var m = p.split(":"); if (E.BYID[m[0]] && m[1]) S.extra[m[0]] = m[1].split(/[+ ]/).filter(function (t) { return /^(images|news|videos)$/.test(t); }); }); }
	if (qs.get("q")) $("se-q").value = qs.get("q");
	function persist() { sset({ sel: S.sel, vsel: S.vsel, custom: S.custom, sets: S.sets, type: S.type, time: S.time, mode: S.mode, exact: S.exact, site: S.site, excl: S.excl, log: S.log, hist: S.hist, fold: S.fold, extra: S.extra }); }

	function all() { return E.ENGINES.concat(S.custom.map(function (c) { return { id: c.id, g: "mine", name: c.name, badge: [c.name.slice(0, 2), "#5a6270"], web: c.web, custom: true }; })); }
	function opts() { return { type: S.type, time: S.time, exact: S.exact, site: S.site, exclude: S.excl }; }
	function q() { return E.clean($("se-q").value); }
	function engineById(id) { return E.BYID[id] || all().filter(function (e) { return e.id === id; })[0]; }
	function tg() { return E.targets(S.sel, S.vsel, S.custom, q(), opts(), S.extra); }
	function hasQuery() { return !!(q() || E.clean(S.site)); }

	/* ---------- toast + clipboard ---------- */
	var toastT;
	function toast(msg) { var t = $("se-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text) {
		if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, fb);
		return Promise.resolve(fb());
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); return ok; }
	}

	/* ---------- render ---------- */
	var filterText = "";
	function cardHtml(e, targets) {
		var on = S.sel.indexOf(e.id) >= 0, na = S.type !== "web" && !(e.types && e.types[S.type]);
		var vs = e.variants && e.variants.length ? (S.vsel[e.id] && S.vsel[e.id].length ? S.vsel[e.id] : [e.variants[0].id]) : null;
		var firstV = vs ? e.variants.filter(function (v) { return v.id === vs[0]; })[0] : null;
		var u = hasQuery() ? E.url(e, q(), opts(), firstV) : null;
		var b = e.badge || [e.name.slice(0, 2), "#5a6270"];
		var h = '<div class="se-card' + (on ? " is-on" : "") + (na ? " is-na" : "") + '" data-id="' + esc(e.id) + '"><div class="se-top"><label class="se-pick"><input type="checkbox" class="se-tick"' + (on ? " checked" : "") + '>' +
			'<span class="se-badge" style="background:' + esc(b[1]) + ";color:" + esc(b[2] || "#fff") + '">' + esc(b[0]) + '</span><span class="se-name" title="' + esc(e.name) + '">' + esc(e.name) + "</span></label>" +
			(e.custom ? '<button type="button" class="se-del" title="Remove this engine" aria-label="Remove ' + esc(e.name) + '">✕</button>' : "") +
			'<a class="se-open' + (u ? "" : " is-off") + '" href="' + (u ? esc(u) : "#") + '" target="' + (S.mode === "same" ? "_self" : "_blank") + '" rel="noopener"' + (u ? "" : ' aria-disabled="true" tabindex="-1"') + ">Open ↗</a></div>";
		if (e.variants && e.variants.length > 1) {
			h += '<div class="se-var" role="group" aria-label="' + esc(e.name) + ' versions">' + e.variants.map(function (v) {
				return '<button type="button" data-v="' + esc(v.id) + '" aria-pressed="' + (vs.indexOf(v.id) >= 0) + '">' + esc(v.label) + "</button>";
			}).join("") + "</div>";
		}
		if (e.types) {
			var ex = S.extra[e.id] || [];
			h += '<div class="se-also" role="group" aria-label="Also search ' + esc(e.name) + ' for"><span>Also:</span>' + ["images", "news", "videos"].filter(function (t) { return e.types[t]; }).map(function (t) {
				return '<button type="button" data-x="' + t + '" aria-pressed="' + (ex.indexOf(t) >= 0) + '" title="Open the ' + esc(e.name) + " " + t + ' search too">' + t.charAt(0).toUpperCase() + t.slice(1) + "</button>";
			}).join("") + "</div>";
		}
		if (na) h += '<div class="se-na">No ' + S.type + " search here</div>";
		else if (e.note) h += '<div class="se-note">' + esc(e.note) + "</div>";
		return h + "</div>";
	}
	function groups() {
		var g = E.GROUPS.slice();
		if (S.custom.length) g.push(["mine", "My own engines", "Engines you added. Saved in this browser."]);
		return g;
	}
	function render() {
		var t = tg(), html = "", list = all(), ft = filterText.toLowerCase();
		groups().forEach(function (g) {
			var items = list.filter(function (e) { return e.g === g[0] && (!ft || e.name.toLowerCase().indexOf(ft) >= 0 || e.id.indexOf(ft) >= 0); });
			if (!items.length) return;
			var n = items.filter(function (e) { return S.sel.indexOf(e.id) >= 0; }).length, folded = !!S.fold[g[0]] && !ft;
			html += '<section class="se-group' + (folded ? " is-folded" : "") + '" data-g="' + g[0] + '"><h2 class="se-gh"><button type="button" class="se-gtoggle" aria-expanded="' + !folded + '"><span class="se-arrow" aria-hidden="true">▼</span>' + esc(g[1]) +
				'</button><button type="button" class="se-gsel" data-g="' + g[0] + '">' + (n === items.length ? "untick group" : "tick group") + '</button><span class="se-gcount">' + n + "/" + items.length + ' ticked</span></h2><div class="se-gbody"><p class="se-gdesc">' + esc(g[2]) + '</p><div class="se-grid">' +
				items.map(function (e) { return cardHtml(e, t); }).join("") + "</div></div></section>";
		});
		if (!html) html = '<p class="tu-note" style="text-align:center;margin:1.5em 0;">No engine matches “' + esc(filterText) + '”.</p>';
		$("se-out").innerHTML = html;
		var nOpen = t.list.length;
		$("se-go").textContent = S.mode === "same" ? "Open first selected" : "Open " + nOpen + (nOpen === 1 ? " engine" : " engines");
		$("se-go").disabled = !hasQuery() || !nOpen;
		$("se-go").title = !hasQuery() ? "Type a search first" : nOpen ? "" : "Tick at least one engine";
		renderPresets(); syncOpts();
	}
	function renderPresets() {
		var cur = S.sel.slice().sort().join(","), h = "";
		E.PRESETS.forEach(function (p) { h += '<button type="button" class="tu-chip" data-p="' + p[0] + '" aria-pressed="' + (p[2].slice().sort().join(",") === cur) + '">' + esc(p[1]) + "</button>"; });
		S.sets.forEach(function (s, i) { h += '<span class="se-myset"><button type="button" class="tu-chip" data-s="' + i + '" aria-pressed="' + (s.ids.slice().sort().join(",") === cur) + '">★ ' + esc(s.name) + '</button></span>'; });
		$("se-presets").innerHTML = h;
	}
	function syncOpts() {
		[["se-type", "t", S.type], ["se-time", "t", S.time], ["se-mode", "m", S.mode]].forEach(function (x) {
			Array.prototype.forEach.call($(x[0]).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset[x[1]] === x[2])); });
		});
		$("se-exact").checked = S.exact; $("se-log").checked = S.log;
		if (document.activeElement !== $("se-site")) $("se-site").value = S.site;
		if (document.activeElement !== $("se-excl")) $("se-excl").value = S.excl;
		$("se-more").open = $("se-more").open || !!(S.site || S.excl || S.exact);
		renderHistory();
	}

	/* ---------- opening ---------- */
	function logSearch() {
		if (!S.log || !q()) return;
		S.hist = S.hist.filter(function (h) { return h.q !== q(); });
		S.hist.unshift({ q: q(), t: Date.now(), n: S.sel.length, ty: S.type });
		S.hist = S.hist.slice(0, 30); persist(); renderHistory();
	}
	function renderHistory() {
		var box = $("se-history"); box.hidden = !S.hist.length;
		$("se-hlist").innerHTML = S.hist.map(function (h, i) {
			var d = new Date(h.t), lbl; try { lbl = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { lbl = ""; }
			return '<li><button type="button" class="se-hq" data-i="' + i + '" title="Search this again">' + esc(h.q) + '</button><span class="se-hm">' + esc(lbl) + "</span></li>";
		}).join("");
	}
	var queue = [];
	function helpHtml() {
		return '<details class="se-help"><summary>How to let this page open all the tabs at once</summary><p>Browsers allow one new tab per click until you allow pop-ups for this site. In <b>Chrome, Edge and Brave</b> click the pop-up icon at the right end of the address bar (or the lock icon, then Site settings) and choose <b>Always allow pop-ups from mes.fm</b>; in Brave also check the shield. In <b>Firefox</b> click <b>Options</b> on the yellow bar and allow pop-ups for this site. In <b>Safari</b> use Safari, Settings for This Website, Pop-up Windows, Allow. Then press <b>Open</b> again.</p></details>';
	}
	function showQueue(note) {
		var warn = $("se-warn");
		if (!queue.length && !note) { warn.hidden = true; return; }
		var h = note || "";
		if (queue.length) {
			h += '<div class="se-queue"><button type="button" class="tu-btn tu-btn--primary se-next" id="se-next">Open next: ' + esc(queue[0].label) + ' <small>(' + queue.length + " left)</small></button>" +
				'<span>Your browser lets a page open one tab per click, so click this for each of the rest' + (S.mode === "step" ? "." : ", or allow pop-ups to skip this step.") + "</span></div>" +
				'<details class="se-rest"><summary>Or click the links yourself</summary>' + queue.map(function (x) { return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.label) + " ↗</a>"; }).join("") + "</details>" + helpHtml();
		}
		warn.innerHTML = h; warn.hidden = false;
	}
	function openOne(x, feat, name) {
		var w = null; try { w = window.open(x.url, name || "_blank", feat || ""); } catch (e) {}
		if (w) { try { w.opener = null; } catch (e) {} return true; }
		return false;
	}
	function openAll() {
		if (!hasQuery()) { $("se-q").focus(); return; }
		var t = tg(), list = t.list; $("se-warn").hidden = true; queue = [];
		if (!list.length) { toast("Tick at least one engine"); return; }
		if (S.mode === "same") { logSearch(); location.href = list[0].url; return; }
		var note = t.skipped.length ? "Skipped (no " + S.type + " search): " + esc(t.skipped.join(", ")) + ". " : "";
		if (S.mode === "step") {            // one engine per click: open the first, queue the rest
			openOne(list[0]); queue = list.slice(1); logSearch();
			if (queue.length) showQueue(note); else if (note) showQueue(note); else toast("Opened 1 search");
			return;
		}
		var rects = null, blocked = [];
		if (S.mode === "window") {
			var sc = window.screen || {}, W = sc.availWidth || window.innerWidth, H = sc.availHeight || window.innerHeight;
			rects = E.tile(list.length, W, H, sc.availLeft || 0, sc.availTop || 0);
		}
		list.forEach(function (x, i) {
			var feat = rects ? "popup=yes,left=" + rects[i].left + ",top=" + rects[i].top + ",width=" + rects[i].width + ",height=" + rects[i].height : "";
			if (!openOne(x, feat, rects ? "se-win-" + i : "_blank")) blocked.push(x);
		});
		logSearch();
		queue = blocked;
		if (blocked.length) {
			showQueue(note + "<b>Your browser opened " + (list.length - blocked.length) + " of " + list.length + " and blocked the rest.</b> ");
		} else if (note) showQueue(note); else toast("Opened " + list.length + (list.length === 1 ? " search" : " searches"));
	}
	$("se-warn").addEventListener("click", function (e) {
		var b = e.target.closest("#se-next"); if (!b || !queue.length) return;
		var x = queue.shift();
		if (!openOne(x)) { queue.unshift(x); toast("Still blocked: allow pop-ups for mes.fm, or click the links below"); }
		showQueue(queue.length ? "" : "");
		if (!queue.length) { $("se-warn").hidden = true; toast("Opened them all"); }
	});
	$("se-go").onclick = openAll;
	$("se-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); openAll(); } });
	$("se-q").addEventListener("input", function () { $("se-warn").hidden = true; render(); });
	$("se-out").addEventListener("click", function (e) {
		var a = e.target.closest("a.se-open");
		if (a) { if (a.classList.contains("is-off")) { e.preventDefault(); $("se-q").focus(); toast("Type a search first"); } else logSearch(); return; }
		var gt = e.target.closest(".se-gtoggle");
		if (gt) { var g = gt.closest(".se-group").dataset.g; if (S.fold[g]) delete S.fold[g]; else S.fold[g] = 1; persist(); render(); return; }
		var gs = e.target.closest(".se-gsel");
		if (gs) {
			var ids = all().filter(function (x) { return x.g === gs.dataset.g; }).map(function (x) { return x.id; }), allOn = ids.every(function (id) { return S.sel.indexOf(id) >= 0; });
			S.sel = S.sel.filter(function (id) { return ids.indexOf(id) < 0; }); if (!allOn) S.sel = S.sel.concat(ids);
			persist(); render(); return;
		}
		var xb = e.target.closest(".se-also button");
		if (xb) {
			var xid = xb.closest(".se-card").dataset.id, cur2 = S.extra[xid] ? S.extra[xid].slice() : [], t2 = xb.dataset.x, k2 = cur2.indexOf(t2);
			if (k2 >= 0) cur2.splice(k2, 1); else cur2.push(t2);
			if (cur2.length) S.extra[xid] = cur2; else delete S.extra[xid];
			if (cur2.length && S.sel.indexOf(xid) < 0) S.sel.push(xid);
			persist(); render(); return;
		}
		var vb = e.target.closest(".se-var button");
		if (vb) {
			var id = vb.closest(".se-card").dataset.id, e0 = engineById(id), cur = S.vsel[id] && S.vsel[id].length ? S.vsel[id].slice() : [e0.variants[0].id], v = vb.dataset.v, k = cur.indexOf(v);
			if (k >= 0) { if (cur.length > 1) cur.splice(k, 1); } else cur.push(v);
			S.vsel[id] = cur; if (S.sel.indexOf(id) < 0) S.sel.push(id);
			persist(); render(); return;
		}
		var del = e.target.closest(".se-del");
		if (del) { var did = del.closest(".se-card").dataset.id; S.custom = S.custom.filter(function (c) { return c.id !== did; }); S.sel = S.sel.filter(function (x) { return x !== did; }); persist(); render(); toast("Engine removed"); }
	});
	$("se-out").addEventListener("change", function (e) {
		if (!e.target.classList.contains("se-tick")) return;
		var id = e.target.closest(".se-card").dataset.id, k = S.sel.indexOf(id);
		if (e.target.checked && k < 0) S.sel.push(id); else if (!e.target.checked && k >= 0) S.sel.splice(k, 1);
		persist(); render();
	});

	/* ---------- options ---------- */
	function seg(id, key, attr) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S[key] = b.dataset[attr]; persist(); render(); }); }
	seg("se-type", "type", "t"); seg("se-time", "time", "t"); seg("se-mode", "mode", "m");
	$("se-exact").onchange = function () { S.exact = this.checked; persist(); render(); };
	$("se-log").onchange = function () { S.log = this.checked; if (!S.log) S.hist = []; persist(); render(); };
	$("se-site").addEventListener("input", function () { S.site = this.value.trim(); persist(); render(); });
	$("se-excl").addEventListener("input", function () { S.excl = this.value.trim(); persist(); render(); });
	$("se-filter").addEventListener("input", function () { filterText = this.value.trim(); render(); });
	$("se-presets").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.p) { var p = E.PRESETS.filter(function (x) { return x[0] === b.dataset.p; })[0]; S.sel = p[2].slice(); }
		else if (b.dataset.s) { var s = S.sets[+b.dataset.s]; if (e.shiftKey && confirm("Delete your set “" + s.name + "”?")) S.sets.splice(+b.dataset.s, 1); else S.sel = s.ids.filter(function (id) { return engineById(id); }); }
		persist(); render();
	});
	$("se-selall").onclick = function () {
		var ft = filterText.toLowerCase(), ids = all().filter(function (e) { return !ft || e.name.toLowerCase().indexOf(ft) >= 0; }).map(function (e) { return e.id; });
		ids.forEach(function (id) { if (S.sel.indexOf(id) < 0) S.sel.push(id); }); persist(); render();
	};
	$("se-none").onclick = function () { S.sel = []; persist(); render(); };
	$("se-saveset").onclick = function () {
		if (!S.sel.length) { toast("Tick some engines first"); return; }
		var name = prompt("Name for this set of " + S.sel.length + " engines:\n(Shift-click a saved set later to delete it.)", ""); if (!name || !name.trim()) return;
		name = name.trim().slice(0, 30); S.sets = S.sets.filter(function (s) { return s.name !== name; }); S.sets.push({ name: name, ids: S.sel.slice() }); persist(); render(); toast("Saved set “" + name + "”");
	};
	$("se-copylinks").onclick = function () {
		var t = tg(); if (!t.list.length) { toast(hasQuery() ? "Tick some engines first" : "Type a search first"); return; }
		copy(t.list.map(function (x) { return x.label + ": " + x.url; }).join("\n")).then(function (ok) { toast(ok ? "Copied " + t.list.length + " links" : "Copy failed"); });
	};
	function shareUrl() {
		var p = new URLSearchParams(); if (q()) p.set("q", q()); p.set("e", S.sel.join(","));
		if (S.type !== "web") p.set("t", S.type); if (S.time) p.set("w", S.time); if (S.mode !== "tab") p.set("m", S.mode); if (S.site) p.set("site", S.site); if (S.excl) p.set("ex", S.excl); if (S.exact) p.set("x", "1");
		var ax = Object.keys(S.extra).filter(function (id) { return S.sel.indexOf(id) >= 0 && S.extra[id].length; }).map(function (id) { return id + ":" + S.extra[id].join("+"); }); if (ax.length) p.set("a", ax.join(","));
		var vx = S.sel.filter(function (id) { var e = E.BYID[id]; return e && e.variants && S.vsel[id] && S.vsel[id].length; }).map(function (id) { return id + ":" + S.vsel[id].join("+"); }); if (vx.length) p.set("v", vx.join(","));
		return location.origin + location.pathname + "?" + p.toString();
	}
	function shareClick() {
		if (!S.sel.length) { toast("Tick some engines first"); return; }
		var u = shareUrl(), n = (S.custom.length && S.sel.some(function (id) { return S.custom.some(function (c) { return c.id === id; }); })) ? " (your own engines are not included)" : "";
		copy(u).then(function (ok) { toast(ok ? "Share link copied" + n : "Copy failed"); });
	}
	$("se-sharelink").onclick = shareClick;
	$("se-sharelink2").onclick = shareClick;
	if (qs.get("q") || qs.get("e")) setTimeout(function () { toast("Shared search loaded: press Open to run it"); }, 400);

	/* ---------- history ---------- */
	$("se-hlist").addEventListener("click", function (e) { var b = e.target.closest(".se-hq"); if (!b) return; $("se-q").value = S.hist[+b.dataset.i].q; render(); $("se-q").focus(); window.scrollTo({ top: root.getBoundingClientRect().top + window.pageYOffset - 20, behavior: "smooth" }); });
	$("se-hclear").onclick = function () { S.hist = []; persist(); renderHistory(); };

	/* ---------- own engines ---------- */
	$("se-cadd").onclick = function () {
		var name = $("se-cname").value.trim(), tpl = E.customTemplate($("se-curl").value), m = $("se-cmsg");
		m.classList.remove("is-err");
		if (!name) { m.textContent = "Give the engine a name."; m.classList.add("is-err"); return; }
		if (!E.validCustom(tpl)) { m.textContent = "The address must start with http:// or https:// and contain %s where the search words go."; m.classList.add("is-err"); return; }
		var id = "c" + Date.now().toString(36); S.custom.push({ id: id, name: name, web: tpl }); S.sel.push(id);
		$("se-cname").value = ""; $("se-curl").value = ""; m.textContent = "Added “" + name + "” and ticked it."; persist(); render();
	};
	$("se-export").onclick = function () {
		var blob = new Blob([JSON.stringify({ v: 1, custom: S.custom, sets: S.sets, sel: S.sel, vsel: S.vsel }, null, 1)], { type: "application/json" }), a = document.createElement("a");
		a.href = URL.createObjectURL(blob); a.download = "mes-search-engines-backup.json"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 400);
	};
	$("se-import").onclick = function () { $("se-file").click(); };
	$("se-file").onchange = function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		var r = new FileReader();
		r.onload = function () {
			try {
				var d = JSON.parse(r.result), n = 0;
				(d.custom || []).forEach(function (c) { if (c && c.name && E.validCustom(c.web) && !S.custom.some(function (x) { return x.web === c.web; })) { S.custom.push({ id: "c" + Date.now().toString(36) + n, name: String(c.name).slice(0, 40), web: c.web }); n++; } });
				(d.sets || []).forEach(function (s) { if (s && s.name && Array.isArray(s.ids) && !S.sets.some(function (x) { return x.name === s.name; })) { S.sets.push({ name: String(s.name).slice(0, 30), ids: s.ids.filter(function (id) { return engineById(id); }) }); n++; } });
				persist(); render(); toast(n ? "Restored " + n + " items" : "Nothing new in that file");
			} catch (e) { toast("That doesn't look like a backup file"); }
		};
		r.readAsText(f);
	};

	render();
	if (!q()) $("se-q").focus({ preventScroll: true });
})();
