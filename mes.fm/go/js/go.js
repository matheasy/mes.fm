/* MES Short Links -- mes.fm/go. Lists every redirect of mes.fm/vercel.json (data: /go/redirects.json, written by build_redirects_index.py), searchable and filterable,
 * with a helper that writes the next vercel.json line. State in the URL: ?q=&c=&t=&k=&sort=&x=1 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("go");
	if (!root) return;
	var DATA = null, R = [], st = { q: "", c: "", t: "", k: "", sort: "az", x: false };
	var CHECKS = { dup: ["Listed twice", "The same short name is listed more than once in vercel.json: only the first one is used."], chain: ["Chain", "The destination is itself a redirect: visitors make two hops. Point it straight at the final page."], loop: ["Loop", "This redirect points at itself."], gone: ["Page missing", "The destination page was not found in the Site Index or on disk."], shadow: ["Hides a page", "A real page exists at this address; the redirect wins and the page is unreachable."] };
	var KINDS = [["", "Everything"], ["internal", "Inside mes.fm"], ["external", "Other websites"], ["wild", "Path patterns"]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function toast(msg) { var t = $("go-toast"); if (!t) { t = document.createElement("div"); t.id = "go-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}
	function shortUrl(e) { return "https://mes.fm" + e.s; }

	/* ---------- load ---------- */
	fetch("/go/redirects.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { DATA = d; R = d.r.map(function (e, i) { e.i = i; e.h = (e.s + " " + e.d + " " + (e.title || "") + " " + (e.c || "") + " " + (e.t || "") + " " + (e.n || "")).toLowerCase(); return e; }); init(); })
		.catch(function () { var n = $("go-note"); n.hidden = false; n.textContent = "The short-links list could not be loaded. Try again in a moment."; });

	function cnt(fn) { var n = 0; R.forEach(function (e) { if (fn(e)) n++; }); return n; }
	function init() {
		var q = new URLSearchParams(location.search); st.q = q.get("q") || ""; st.c = q.get("c") || ""; st.t = q.get("t") || ""; st.k = q.get("k") || ""; st.sort = /^(az|cat|new|old)$/.test(q.get("sort") || "") ? q.get("sort") : "az"; st.x = q.get("x") === "1";
		$("go-q").value = st.q; $("go-sort").value = st.sort;
		var bad = cnt(function (e) { return e.x && e.x.length; });
		$("go-stats").innerHTML = stat("Short links", R.length - cnt(function (e) { return e.k === "wild"; }), "named addresses you can share", "tu-stat--hero") + stat("Inside mes.fm", cnt(function (e) { return e.k === "internal"; }), "go to a page on this site") + stat("Other websites", cnt(function (e) { return e.k === "external"; }), "YouTube, files, apps, shops…") +
			'<div class="tu-stat' + (bad ? " go-clickable" : "") + '" id="go-issues" ' + (bad ? 'role="button" tabindex="0" title="Show only the ones that need a look"' : "") + '><div class="tu-stat__label">Need a look</div><div class="tu-stat__value">' + bad + '</div><div class="tu-stat__sub">' + (bad ? "duplicates, chains or missing pages" : "all checks pass") + "</div></div>";
		var ts = {}; R.forEach(function (e) { if (e.t) ts[e.t] = (ts[e.t] || 0) + 1; });
		$("go-t").innerHTML = '<option value="">All topics</option>' + Object.keys(ts).sort().map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + " (" + ts[t] + ")</option>"; }).join(""); $("go-t").value = st.t;
		buildChips(); draw(); wire(); $("go-count").dataset.gen = DATA.generated;
	}
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	function buildChips() {
		var cs = {}; R.forEach(function (e) { cs[e.c] = (cs[e.c] || 0) + 1; });
		var names = Object.keys(cs).sort(function (a, b) { return cs[b] - cs[a] || a.localeCompare(b); });
		$("go-cats").innerHTML = '<button type="button" class="tu-chip" data-c="" aria-pressed="' + (st.c === "") + '">All <small>' + R.length + "</small></button>" + names.map(function (n) { return '<button type="button" class="tu-chip" data-c="' + esc(n) + '" aria-pressed="' + (st.c === n) + '">' + esc(n) + " <small>" + cs[n] + "</small></button>"; }).join("");
		$("go-kinds").innerHTML = KINDS.map(function (k) { return '<button type="button" class="tu-chip" data-k="' + k[0] + '" aria-pressed="' + (st.k === k[0]) + '">' + k[1] + "</button>"; }).join("");
	}

	/* ---------- filter + draw ---------- */
	function filtered() {
		var terms = st.q.toLowerCase().split(/\s+/).filter(Boolean), out = R.filter(function (e) {
			if (st.c && e.c !== st.c) return false; if (st.t && e.t !== st.t) return false; if (st.k && e.k !== st.k) return false; if (st.x && !(e.x && e.x.length)) return false;
			for (var i = 0; i < terms.length; i++) if (e.h.indexOf(terms[i]) < 0) return false; return true;
		});
		out.sort(function (a, b) {
			if (st.sort === "new") return b.i - a.i; if (st.sort === "old") return a.i - b.i;
			if (st.sort === "cat") return a.c.localeCompare(b.c) || a.s.localeCompare(b.s);
			return a.s.toLowerCase().localeCompare(b.s.toLowerCase());
		});
		return out;
	}
	function rowHtml(e) {
		var wild = e.k === "wild", href = wild ? null : e.s, dest = e.d.replace(/^https?:\/\/(www\.)?/, "");
		return '<div class="go-row" data-i="' + e.i + '"><div class="go-short">' + (href ? '<a href="' + esc(href) + '" title="Try it">' + "<b>mes.fm</b>" + esc(e.s) + "</a>" : "<b>mes.fm</b>" + esc(e.s)) + '</div><div class="go-to"><span class="go-title">' + esc(e.title || e.d) + '</span><span class="go-url" title="' + esc(e.d) + '">→ ' + esc(dest) + "</span>" + (e.n ? '<span class="go-note">' + esc(e.n) + "</span>" : "") + '</div><div class="go-tags">' +
			'<span class="go-tag">' + esc(e.c) + "</span>" + (e.t ? '<span class="go-tag">' + esc(e.t) + "</span>" : "") + (e.x || []).map(function (x) { return '<span class="go-tag ' + (x === "loop" || x === "gone" ? "go-tag--bad" : "go-tag--x") + '" title="' + esc(CHECKS[x][1]) + '">' + esc(CHECKS[x][0]) + "</span>"; }).join("") + (wild ? "" : '<button type="button" class="go-copy" data-copy="1" title="Copy ' + esc(shortUrl(e)) + '" aria-label="Copy the short link ' + esc(e.s) + '">Copy</button>') + "</div></div>";
	}
	function draw() {
		var list = filtered(), box = $("go-list");
		$("go-count").textContent = list.length === R.length ? "All " + R.length + " redirects" : list.length + " of " + R.length + " redirects";
		if (!list.length) { box.innerHTML = '<div class="go-empty">No short links match. Clear a filter or try fewer words.</div>'; }
		else if (st.sort === "cat") { var last = null, h = ""; list.forEach(function (e) { if (e.c !== last) { last = e.c; h += '<div class="go-grp" style="padding:0.5em 1em;background:var(--go-surf2);font-weight:700;font-size:0.9em;border-bottom:1px solid var(--go-line);">' + esc(e.c) + "</div>"; } h += rowHtml(e); }); box.innerHTML = h; }
		else box.innerHTML = list.map(rowHtml).join("");
		[].forEach.call($("go-cats").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.c === st.c)); }); [].forEach.call($("go-kinds").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.k === st.k)); });
		var q = new URLSearchParams(); if (st.q) q.set("q", st.q); if (st.c) q.set("c", st.c); if (st.t) q.set("t", st.t); if (st.k) q.set("k", st.k); if (st.sort !== "az") q.set("sort", st.sort); if (st.x) q.set("x", "1");
		history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q.toString() : ""));
	}
	function wire() {
		var tm; $("go-q").addEventListener("input", function () { st.q = this.value; clearTimeout(tm); tm = setTimeout(draw, 120); });
		$("go-t").onchange = function () { st.t = this.value; draw(); }; $("go-sort").onchange = function () { st.sort = this.value; draw(); };
		$("go-cats").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.c = b.dataset.c; draw(); } });
		$("go-kinds").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.k = b.dataset.k; draw(); } });
		var iss = $("go-issues"); if (iss && iss.getAttribute("role")) { var fn = function () { st.x = !st.x; draw(); toast(st.x ? "Showing only the ones that need a look" : "Showing everything"); }; iss.onclick = fn; iss.onkeydown = function (e) { if (e.key === "Enter") fn(); }; }
		$("go-list").addEventListener("click", function (e) { var b = e.target.closest("[data-copy]"); if (!b) return; var row = b.closest(".go-row"), r = R[+row.dataset.i]; copy(shortUrl(r), "Copied " + shortUrl(r)); });
		document.addEventListener("keydown", function (e) { if (e.key === "/" && !/^(input|textarea|select)$/i.test(e.target.tagName)) { e.preventDefault(); $("go-q").focus(); } });
		$("go-export-md").onclick = function () { var l = filtered(); copy("| Short link | Goes to | Category |\n|---|---|---|\n" + l.map(function (e) { return "| " + shortUrl(e) + " | " + e.d + " | " + e.c + " |"; }).join("\n"), "Copied " + l.length + " rows"); };
		$("go-export-csv").onclick = function () { var l = filtered(); copy("Short link\tGoes to\tTitle\tCategory\tTopic\n" + l.map(function (e) { return [shortUrl(e), e.d, e.title || "", e.c, e.t || ""].join("\t"); }).join("\n"), "Copied: paste it into a spreadsheet"); };
		helper();
	}

	/* ---------- the "add a short link" helper ---------- */
	function helper() {
		var src = $("go-src"), dst = $("go-dst"), perm = $("go-perm"), msg = $("go-add-msg"), snip = $("go-snip"), cb = $("go-snip-copy"), tb = $("go-try"), tmr;
		function norm(p) { return "/" + String(p || "").trim().replace(/^https?:\/\/(www\.)?mes\.fm/i, "").replace(/^\/+/, "").replace(/\/+$/, ""); }
		function check() {
			var s = norm(src.value), d = dst.value.trim(), m = "", cls = "", ok = true;
			if (!src.value.trim() && !d) { msg.textContent = ""; msg.className = "go-msg"; snip.hidden = true; cb.disabled = tb.disabled = true; return; }
			if (!/^\/[A-Za-z0-9._~\-\/]+$/.test(s)) { m = "The short name can only use letters, numbers, dashes and slashes."; cls = "bad"; ok = false; }
			else if (!d) { m = "Now add where it should go."; cls = ""; ok = false; }
			else if (!/^(https?:\/\/|\/)/.test(d)) { m = "The destination should start with https:// (another site) or / (a page on mes.fm)."; cls = "bad"; ok = false; }
			else {
				var dup = R.filter(function (e) { return e.s.toLowerCase() === s.toLowerCase(); })[0], dd = norm(d.replace(/^https?:\/\/(www\.)?mes\.fm/i, ""));
				if (dup) { m = "Taken: " + s + " already goes to " + dup.d + ". Pick another name, or edit that line."; cls = "bad"; ok = false; }
				else if (/^\//.test(d) && dd.toLowerCase() === s.toLowerCase()) { m = "That would redirect to itself."; cls = "bad"; ok = false; }
				else if (/^\//.test(d) && R.some(function (e) { return e.k !== "wild" && e.s.toLowerCase() === dd.toLowerCase(); })) { m = "Heads up: the destination is itself a short link, so visitors would make two hops. Point it at the final page instead."; cls = "warn"; }
				else { m = "Free: nothing uses " + s + " yet."; cls = "ok"; }
			}
			msg.textContent = m; msg.className = "go-msg " + cls;
			if (ok) { snip.hidden = false; snip.textContent = '    { "source": "' + s + '", "destination": "' + d.replace(/"/g, '\\"') + '", "permanent": ' + (perm.value === "1" ? "true" : "false") + " },"; } else snip.hidden = true;
			cb.disabled = !ok; tb.disabled = !ok;
		}
		[src, dst].forEach(function (i) { i.addEventListener("input", function () { clearTimeout(tmr); tmr = setTimeout(check, 100); }); }); perm.onchange = check;
		cb.onclick = function () { copy(snip.textContent, "Copied the line: paste it into the redirects list"); };
		tb.onclick = function () { var d = dst.value.trim(); window.open(/^\//.test(d) ? d : d, "_blank", "noopener"); };
	}
})();
