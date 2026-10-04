/* MES Site Index -- mes.fm/site-index
 * A page inventory + template audit. Data: /site-index/pages.json (written by build_site_index.py; fetched once, here, after load).
 * Views: All pages (filter / sort / paginate), Grouped (by section | template | generator), URL tree, Template gallery, How pages are classified.
 * State lives in the URL (?q=&s=&t=&g=&f=&i=&v=&gb=&sort=&dir=&p=&n=) so every view is shareable. No dependencies.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("si");
	if (!root) return;
	var DATA_URL = "/site-index/pages.json";
	var C = { url: 0, title: 1, sec: 2, tpl: 3, gen: 4, feat: 5, iss: 6, dl: 7, h1: 8, words: 9, bytes: 10, date: 11, kind: 12 };
	var D = null, ROWS = [], HARD = 0, TPLS = [], SECS = [], GENS = [], FEATS = [], ISSUES = [], BAD = {};
	var gslug = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); };
	var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
	var fmt = function (n) { return Number(n).toLocaleString("en-US"); };
	var pct = function (a, b) { return b ? Math.round(a * 1000 / b) / 10 : 0; };
	var bitc = function (n) { var c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };

	// short pill text for each issue key (the long label is the tooltip)
	var ISS_SHORT = { nodesc: "no description", shortdesc: "short description", longdesc: "long description", noog: "no og:image", ogmiss: "og:image missing", notw: "no twitter:image",
		nocanon: "no canonical", canonbad: "canonical ≠ URL", canonrel: "relative canonical", notitle: "no title", noh1: "no h1", multih1: "several h1", nolang: "no lang", novp: "no viewport",
		broken: "broken refs", jq: "jQuery", bs: "Bootstrap", noindex: "noindex", unclass: "unclassified", dupurl: "duplicate URL", oldsub: "old subdomain", mismatch: "shell ≠ generator" };
	var FEAT_SHORT = { ads: "Ads", aside: "Side", bad: "Btm ad", com: "Cmts", cbar: "Bar", ctl: "A±", srch: "Srch", sw: "Wide", th: "Thtr", dark: "Dark" };

	/* ------------------------------------------------------------------ state */
	var S = { q: "", s: "", t: "", g: "", f: "", i: "", v: "table", gb: "section", sort: "url", dir: "asc", p: 1, n: 100, minor: false };
	var DEFAULT = JSON.stringify(S);
	function readURL() {
		var qs = new URLSearchParams(location.search), o = JSON.parse(DEFAULT);
		["q", "s", "t", "g", "f", "i", "v", "gb", "sort", "dir"].forEach(function (k) { if (qs.get(k) != null) o[k] = qs.get(k); });
		if (qs.get("p")) o.p = Math.max(1, parseInt(qs.get("p"), 10) || 1);
		if (qs.get("n")) o.n = [50, 100, 250, 500].indexOf(parseInt(qs.get("n"), 10)) >= 0 ? parseInt(qs.get("n"), 10) : 100;
		o.minor = qs.get("minor") === "1";
		if (["table", "group", "tree", "templates", "rules"].indexOf(o.v) < 0) o.v = "table";
		if (["section", "template", "generator"].indexOf(o.gb) < 0) o.gb = "section";
		return o;
	}
	function writeURL(push) {
		var d = JSON.parse(DEFAULT), qs = new URLSearchParams();
		Object.keys(S).forEach(function (k) {
			if (S[k] === d[k] || S[k] === "" || S[k] === false) return;
			if (k === "p" && S.v !== "table") return;
			qs.set(k, S[k] === true ? "1" : S[k]);
		});
		var url = location.pathname + (qs.toString() ? "?" + qs.toString() : "");
		try { (push ? history.pushState : history.replaceState).call(history, null, "", url); } catch (e) {}
	}
	function shareURL() { return location.origin + location.pathname + (location.search || ""); }

	/* ------------------------------------------------------------------ data helpers */
	function featList(mask) { var o = []; FEATS.forEach(function (f, i) { if (mask & (1 << i)) o.push(f[1]); }); return o; }
	function issList(mask) { var o = []; ISSUES.forEach(function (f, i) { if (mask & (1 << i)) o.push(f); }); return o; }
	function fileOf(r) { var u = r[C.url]; if (u === "/") return "mes.fm/index.html"; return "mes.fm" + u + (r[C.kind] ? "/index.html" : ".html"); }
	function issBit(key) { for (var i = 0; i < ISSUES.length; i++) if (ISSUES[i][0] === key) return 1 << i; return 0; }
	function featBit(key) { for (var i = 0; i < FEATS.length; i++) if (FEATS[i][0] === key) return 1 << i; return 0; }

	/* ------------------------------------------------------------------ filtering + sorting */
	var cache = { key: null, rows: null };
	function matches(r, qwords) {
		if (S.s !== "" && SECS[r[C.sec]][0] !== S.s) return false;
		if (S.t !== "" && TPLS[r[C.tpl]][0] !== S.t) return false;
		if (S.g !== "" && gslug(GENS[r[C.gen]]) !== S.g) return false;
		if (S.f) {
			var m = /^(has|no):(.+)$/.exec(S.f), b = m ? featBit(m[2]) : 0;
			if (b) { var has = !!(r[C.feat] & b); if ((m[1] === "has") !== has) return false; }
		}
		if (S.i) {
			if (S.i === "attention") { if (!(r[C.iss] & HARD)) return false; }
			else if (S.i === "clean") { if (r[C.iss] & HARD) return false; }
			else { var ib = issBit(S.i); if (ib && !(r[C.iss] & ib)) return false; }
		}
		if (qwords.length) { var hay = r._h; for (var k = 0; k < qwords.length; k++) if (hay.indexOf(qwords[k]) < 0) return false; }
		return true;
	}
	var SORTERS = {
		url: function (r) { return r[C.url]; }, title: function (r) { return r[C.title].toLowerCase(); },
		section: function (r) { return SECS[r[C.sec]][1]; }, template: function (r) { return TPLS[r[C.tpl]][1]; },
		generator: function (r) { return GENS[r[C.gen]]; }, features: function (r) { return bitc(r[C.feat]); },
		issues: function (r) { return bitc(r[C.iss]); }, words: function (r) { return r[C.words]; },
		bytes: function (r) { return r[C.bytes]; }, date: function (r) { return r[C.date] || ""; }
	};
	function filtered() {
		var key = [S.q, S.s, S.t, S.g, S.f, S.i, S.sort, S.dir].join("\u0001");
		if (cache.key === key) return cache.rows;
		var qwords = S.q.toLowerCase().split(/\s+/).filter(Boolean);
		var out = ROWS.filter(function (r) { return matches(r, qwords); });
		var fn = SORTERS[S.sort] || SORTERS.url, sign = S.dir === "desc" ? -1 : 1;
		out.sort(function (a, b) { var x = fn(a), y = fn(b); return (x < y ? -1 : x > y ? 1 : (a[C.url] < b[C.url] ? -1 : 1)) * sign; });
		cache = { key: key, rows: out };
		return out;
	}
	function activeFilterCount() { return ["q", "s", "t", "g", "f", "i"].filter(function (k) { return S[k] !== ""; }).length; }

	/* ------------------------------------------------------------------ small renderers */
	function pill(text, cls, title) { return '<span class="si-pill ' + cls + '"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + esc(text) + "</span>"; }
	function featDots(mask) {
		var present = featList(mask), dots = "";
		FEATS.forEach(function (f, i) { dots += '<i class="si-dot' + (mask & (1 << i) ? " on" : "") + '"></i>'; });
		return '<span class="si-dots" role="img" aria-label="' + esc(present.length ? "Has: " + present.join(", ") : "No features") + '" title="' + esc(present.length ? "Has: " + present.join(", ") + "\nLacks: " + FEATS.filter(function (f, i) { return !(mask & (1 << i)); }).map(function (f) { return f[1]; }).join(", ") : "None of the tracked features") + '">' + dots + "</span>";
	}
	function issPills(r) {
		var out = "", list = issList(r[C.iss]), shown = 0, hidden = 0;
		list.forEach(function (it) {
			var hard = it[2], key = it[0];
			if (!hard && !S.minor) { hidden++; return; }
			var txt = ISS_SHORT[key] || it[1];
			if (key === "broken" && BAD[r[C.url]]) txt += " (" + BAD[r[C.url]].length + (BAD[r[C.url]].length >= 4 ? "+" : "") + ")";
			out += pill(txt, hard ? "is-hard" : "is-soft", it[1] + (key === "broken" && BAD[r[C.url]] ? ": " + BAD[r[C.url]].join(", ") : ""));
			shown++;
		});
		if (!shown && !hidden) return '<span class="si-ok" title="No issues found">ok</span>';
		if (!shown) return '<span class="si-ok" title="Only minor issues (hidden; tick Show minor issues)">ok</span>';
		return out;
	}
	function toast(msg) { var t = $("si-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
	function copy(text, okMsg) {
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(okMsg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback); else fallback();
	}

	/* ------------------------------------------------------------------ dashboard */
	function bars(el, items, selected, onPick, total) {
		var max = Math.max.apply(null, items.map(function (x) { return x.n; }).concat([1]));
		el.innerHTML = items.map(function (x) {
			return '<button type="button" class="si-bar' + (selected === x.key ? " is-on" : "") + '" data-key="' + esc(x.key) + '" aria-pressed="' + (selected === x.key) + '" title="' + esc(x.label + ": " + fmt(x.n) + " pages (" + pct(x.n, total) + "%)") + '">' +
				'<span class="si-bar__l">' + esc(x.label) + '</span><span class="si-bar__t"><span class="si-bar__f' + (x.cls ? " " + x.cls : "") + '" style="width:' + Math.max(1.5, x.n * 100 / max) + '%"></span></span><span class="si-bar__n">' + fmt(x.n) + "</span></button>";
		}).join("");
		el.onclick = function (e) { var b = e.target.closest(".si-bar"); if (b) onPick(b.getAttribute("data-key")); };
	}
	function counts(fn, size) { var c = new Array(size).fill(0); ROWS.forEach(function (r) { c[fn(r)]++; }); return c; }
	function renderDash() {
		var total = ROWS.length, ct = counts(function (r) { return r[C.tpl]; }, TPLS.length), cs = counts(function (r) { return r[C.sec]; }, SECS.length), cg = counts(function (r) { return r[C.gen]; }, GENS.length);
		var unclass = ct[TPLS.length - 1], used = ct.filter(function (n, i) { return n > 0 && i < TPLS.length - 1; }).length;
		var hardN = ROWS.filter(function (r) { return r[C.iss] & HARD; }).length, deployed = ROWS.filter(function (r) { return TPLS[r[C.tpl]][0] !== "httrack"; }).length;
		var jq = ROWS.filter(function (r) { return r[C.iss] & issBit("jq"); }).length;
		$("si-tiles").innerHTML =
			tile("Pages", fmt(total), fmt(deployed) + " deployed, " + fmt(total - deployed) + " legacy capture") + tile("Templates in use", used + " of " + (TPLS.length - 1), "ordered rules, first match wins") +
			tile("Unclassified", fmt(unclass), unclass ? "no rule matched: look at these" : "every page matched a rule", unclass ? "is-bad" : "is-good") +
			tile("Pages with a red issue", fmt(hardN), pct(hardN, total) + "% of pages", hardN ? "is-warn" : "is-good") + tile("Still load jQuery", pct(jq, total) + "%", fmt(jq) + " pages");
		$("si-attn").innerHTML = '<strong>Start here:</strong> <button type="button" class="si-link" id="si-attn-link">' + fmt(hardN) + ' pages with a red issue (including ' + fmt(unclass) + ' unclassified)</button> · ' +
			'<button type="button" class="si-link" data-pick-i="mismatch">shell does not match generator</button> · <button type="button" class="si-link" data-pick-i="broken">broken references</button> · <button type="button" class="si-link" data-pick-i="ogmiss">og:image file missing</button> · <button type="button" class="si-link" data-pick-i="nodesc">no description</button>';
		$("si-attn").onclick = function (e) {
			var b = e.target.closest("button"); if (!b) return;
			if (b.id === "si-attn-link") setFilters({ i: "attention" }, true); else if (b.getAttribute("data-pick-i")) setFilters({ i: b.getAttribute("data-pick-i") }, true);
		};
		var ti = TPLS.map(function (t, i) { return { key: t[0], label: t[1], n: ct[i], cls: t[0] === "unclassified" ? "is-bad" : "" }; }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; });
		bars($("si-bars-tpl"), ti, S.t, function (k) { setFilters({ t: S.t === k ? "" : k }, true); }, total);
		var si = SECS.map(function (t, i) { return { key: t[0], label: t[1], n: cs[i] }; }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; });
		bars($("si-bars-sec"), si, S.s, function (k) { setFilters({ s: S.s === k ? "" : k }, true); }, total);
		var gi = GENS.map(function (t, i) { return { key: gslug(t), label: t, n: cg[i], cls: t === "unknown" ? "is-bad" : "" }; }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; });
		bars($("si-bars-gen"), gi, S.g, function (k) { setFilters({ g: S.g === k ? "" : k }, true); }, total);
		var fr = FEATS.map(function (f, i) { var n = ROWS.filter(function (r) { return r[C.feat] & (1 << i); }).length; return { f: f, n: n }; });
		$("si-feats").innerHTML = '<table class="si-mini"><tbody>' + fr.map(function (x) {
			return "<tr><th scope=\"row\" title=\"" + esc(x.f[2]) + "\">" + esc(x.f[1]) + '</th><td class="si-mini__bar"><span class="si-bar__t"><span class="si-bar__f" style="width:' + pct(x.n, total) + '%"></span></span></td><td class="si-mini__n">' + pct(x.n, total) + '%</td><td class="si-mini__a"><button type="button" class="si-link" data-pick-f="has:' + x.f[0] + '">has</button> <button type="button" class="si-link" data-pick-f="no:' + x.f[0] + '">lacks</button></td></tr>';
		}).join("") + "</tbody></table>";
		$("si-feats").onclick = function (e) { var b = e.target.closest("[data-pick-f]"); if (b) setFilters({ f: b.getAttribute("data-pick-f") }, true); };
		var ir = ISSUES.map(function (it, i) { return { it: it, n: ROWS.filter(function (r) { return r[C.iss] & (1 << i); }).length }; }).sort(function (a, b) { return (b.it[2] - a.it[2]) || (b.n - a.n); });
		$("si-issues").innerHTML = '<table class="si-mini"><tbody>' + ir.map(function (x) {
			return "<tr><th scope=\"row\">" + esc(x.it[1]) + '</th><td class="si-mini__bar"><span class="si-bar__t"><span class="si-bar__f ' + (x.it[2] ? "is-bad" : "is-warn") + '" style="width:' + pct(x.n, total) + '%"></span></span></td><td class="si-mini__n">' + fmt(x.n) + '</td><td class="si-mini__a">' +
				(x.n ? '<button type="button" class="si-link" data-pick-i="' + x.it[0] + '">show</button>' : "") + "</td></tr>";
		}).join("") + "</tbody></table>";
		$("si-issues").onclick = function (e) { var b = e.target.closest("[data-pick-i]"); if (b) setFilters({ i: b.getAttribute("data-pick-i") }, true); };
	}
	function tile(label, value, sub, cls) { return '<div class="tu-stat ' + (cls || "") + '"><div class="tu-stat__label">' + esc(label) + '</div><div class="tu-stat__value">' + esc(value) + '</div><div class="tu-stat__sub">' + esc(sub) + "</div></div>"; }

	/* ------------------------------------------------------------------ controls */
	function fillSelects() {
		function opts(sel, first, items, cur) { $(sel).innerHTML = '<option value="">' + esc(first) + "</option>" + items.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === cur ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join(""); }
		var cs = counts(function (r) { return r[C.sec]; }, SECS.length), ct = counts(function (r) { return r[C.tpl]; }, TPLS.length), cg = counts(function (r) { return r[C.gen]; }, GENS.length);
		opts("si-s", "All sections", SECS.map(function (x, i) { return [x[0], x[1] + " (" + fmt(cs[i]) + ")"]; }).filter(function (x, i) { return cs[i]; }), S.s);
		opts("si-t", "All templates", TPLS.map(function (x, i) { return [x[0], x[1] + " (" + fmt(ct[i]) + ")"]; }).filter(function (x, i) { return ct[i]; }), S.t);
		opts("si-g", "All generators", GENS.map(function (x, i) { return [gslug(x), x + " (" + fmt(cg[i]) + ")"]; }).filter(function (x, i) { return cg[i]; }), S.g);
		var fo = []; FEATS.forEach(function (f) { fo.push(["has:" + f[0], "Has " + f[1]]); }); FEATS.forEach(function (f) { fo.push(["no:" + f[0], "Lacks " + f[1]]); });
		opts("si-f", "Any feature", fo, S.f);
		var io = [["attention", "Needs attention (red issues)"], ["clean", "No red issues"]].concat(ISSUES.map(function (x) { return [x[0], x[1]]; }));
		opts("si-i", "Any issue", io, S.i);
		$("si-q").value = S.q;
	}
	function setFilters(o, scroll) {
		Object.keys(o).forEach(function (k) { S[k] = o[k]; });
		S.p = 1;
		if (scroll && S.v !== "table" && S.v !== "group" && S.v !== "tree") S.v = "table";
		syncControls(); render(); writeURL(true);
		if (scroll) $("si-controls").scrollIntoView({ behavior: "smooth", block: "start" });
	}
	function syncControls() {
		["s", "t", "g", "f", "i"].forEach(function (k) { $("si-" + k).value = S[k]; if ($("si-" + k).value !== S[k]) { $("si-" + k).value = ""; } });
		$("si-q").value = S.q;
		Array.prototype.forEach.call($("si-tabs").children, function (b) { var on = b.getAttribute("data-v") === S.v; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
		$("si-filters").hidden = S.v === "templates" || S.v === "rules";
		$("si-clear").disabled = !activeFilterCount();
		var showMark = S.v === "table" || S.v === "group" || S.v === "tree";
		$("si-csv").hidden = !showMark; $("si-md").hidden = !showMark; $("si-attn-btn").hidden = !showMark;
	}
	function bindControls() {
		var qt;
		$("si-q").addEventListener("input", function () { clearTimeout(qt); var v = this.value; qt = setTimeout(function () { S.q = v; S.p = 1; render(); writeURL(false); }, 140); });
		["s", "t", "g", "f", "i"].forEach(function (k) { $("si-" + k).addEventListener("change", function () { S[k] = this.value; S.p = 1; syncControls(); render(); writeURL(true); }); });
		$("si-clear").addEventListener("click", function () { S.q = ""; S.s = ""; S.t = ""; S.g = ""; S.f = ""; S.i = ""; S.p = 1; syncControls(); render(); writeURL(true); });
		$("si-attn-btn").addEventListener("click", function () { setFilters({ i: S.i === "attention" ? "" : "attention" }, false); });
		$("si-tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { S.v = b.getAttribute("data-v"); syncControls(); render(); writeURL(true); } });
		$("si-tabs").addEventListener("keydown", function (e) {
			if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
			var bs = Array.prototype.slice.call($("si-tabs").children), i = bs.indexOf(document.activeElement); if (i < 0) return;
			var n = bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length]; n.focus(); n.click(); e.preventDefault();
		});
		$("si-csv").addEventListener("click", exportCSV);
		$("si-md").addEventListener("click", exportMarkdown);
		$("si-link").addEventListener("click", function () { copy(shareURL(), "Link to this view copied"); });
		window.addEventListener("popstate", function () { S = readURL(); syncControls(); render(); });
		document.addEventListener("keydown", function (e) { if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "") && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $("si-q").focus(); } });
	}

	/* ------------------------------------------------------------------ exports */
	function csvCell(v) { v = String(v == null ? "" : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
	function exportCSV() {
		var rows = filtered(), head = ["url", "title", "section", "template", "generator", "features", "issues", "meta_description_length", "h1_count", "words", "bytes", "last_commit", "file"];
		var out = [head.join(",")];
		rows.forEach(function (r) {
			out.push([r[C.url], r[C.title], SECS[r[C.sec]][1], TPLS[r[C.tpl]][1], GENS[r[C.gen]], featList(r[C.feat]).join("; "), issList(r[C.iss]).map(function (x) { return x[1]; }).join("; "), r[C.dl], r[C.h1], r[C.words], r[C.bytes], r[C.date], fileOf(r)].map(csvCell).join(","));
		});
		var blob = new Blob(["﻿" + out.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
		var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mes-fm-site-index" + (activeFilterCount() ? "-filtered" : "") + ".csv";
		document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
		toast("Downloaded " + fmt(rows.length) + " rows");
	}
	function exportMarkdown() {
		var rows = filtered(), cap = 500, mdc = function (s) { return String(s).replace(/\|/g, "\\|").replace(/\n/g, " "); };
		var out = ["| URL | Title | Section | Template | Generator | Issues |", "|---|---|---|---|---|---|"];
		rows.slice(0, cap).forEach(function (r) {
			out.push("| " + mdc("https://mes.fm" + (r[C.url] === "/" ? "/" : r[C.url])) + " | " + mdc(r[C.title]) + " | " + mdc(SECS[r[C.sec]][1]) + " | " + mdc(TPLS[r[C.tpl]][1]) + " | " + mdc(GENS[r[C.gen]]) + " | " + mdc(issList(r[C.iss]).filter(function (x) { return x[2]; }).map(function (x) { return x[1]; }).join("; ")) + " |");
		});
		if (rows.length > cap) out.push("", "_" + fmt(rows.length - cap) + " more rows not shown (limit " + cap + ")._");
		copy(out.join("\n"), "Copied " + fmt(Math.min(cap, rows.length)) + " rows as Markdown");
	}

	/* ------------------------------------------------------------------ views */
	var view = $("si-view");
	function updateCount(rows) {
		var n = rows.length;
		$("si-count").innerHTML = "<b>" + fmt(n) + "</b> of " + fmt(ROWS.length) + " pages" + (activeFilterCount() ? " match" : "");
	}
	function render() {
		var rows = filtered();
		syncControls();
		updateCount(rows);
		view.hidden = false;
		if (S.v === "table") renderTable(rows);
		else if (S.v === "group") renderGroups(rows);
		else if (S.v === "tree") renderTree(rows);
		else if (S.v === "templates") renderTemplates();
		else renderRules();
		markBars();
	}
	function markBars() {
		[["si-bars-tpl", S.t], ["si-bars-sec", S.s], ["si-bars-gen", S.g]].forEach(function (p) {
			Array.prototype.forEach.call($(p[0]).querySelectorAll(".si-bar"), function (b) { var on = b.getAttribute("data-key") === p[1]; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
		});
	}

	function sortHead(key, label, extra) {
		var on = S.sort === key, dir = on ? S.dir : "none";
		return '<th scope="col" class="si-c-' + key + (extra ? " " + extra : "") + '" aria-sort="' + (on ? (S.dir === "asc" ? "ascending" : "descending") : "none") + '"><button type="button" class="si-sort" data-sort="' + key + '">' + esc(label) + '<span class="si-sort__a" aria-hidden="true">' + (on ? (S.dir === "asc" ? "▲" : "▼") : "↕") + "</span></button></th>";
	}
	function rowHTML(r, i) {
		var url = r[C.url], sec = SECS[r[C.sec]], tpl = TPLS[r[C.tpl]], isU = tpl[0] === "unclassified", isH = tpl[0] === "httrack";
		return '<tr data-i="' + i + '"><td class="si-c-url" data-label="URL"><button type="button" class="si-exp" aria-expanded="false" aria-label="Details for ' + esc(url) + '" data-exp="' + i + '">▸</button><a class="si-url" href="' + (isH ? "#" : esc(url)) + '" ' + (isH ? 'title="HTTrack capture, not deployed" onclick="return false"' : 'target="_blank" rel="noopener"') + ">" + esc(url) + "</a></td>" +
			'<td class="si-c-title" data-label="Title">' + esc(r[C.title] || "(no title)") + "</td>" +
			'<td class="si-c-section" data-label="Section"><button type="button" class="si-tagbtn" data-pick-s="' + esc(sec[0]) + '">' + esc(sec[1]) + "</button></td>" +
			'<td class="si-c-template" data-label="Template"><button type="button" class="si-tagbtn' + (isU ? " is-bad" : "") + '" data-pick-t="' + esc(tpl[0]) + '" title="' + esc(tpl[2]) + '">' + esc(tpl[1]) + "</button></td>" +
			'<td class="si-c-generator" data-label="Generator"><button type="button" class="si-tagbtn" data-pick-g="' + esc(gslug(GENS[r[C.gen]])) + '">' + esc(GENS[r[C.gen]]) + "</button></td>" +
			'<td class="si-c-features" data-label="Features">' + featDots(r[C.feat]) + "</td>" +
			'<td class="si-c-issues" data-label="Issues">' + issPills(r) + "</td>" +
			'<td class="si-c-words" data-label="Words">' + fmt(r[C.words]) + "</td>" +
			'<td class="si-c-date" data-label="Updated">' + esc(r[C.date] || "uncommitted") + "</td></tr>";
	}
	function detailHTML(r) {
		var tpl = TPLS[r[C.tpl]], url = r[C.url], bad = BAD[url], iss = issList(r[C.iss]);
		return '<td colspan="9"><div class="si-detail"><dl>' +
			"<dt>Template</dt><dd><b>" + esc(tpl[1]) + "</b> <span class=\"si-mut\">(" + esc(tpl[0]) + ")</span><br>" + esc(tpl[2]) + "</dd>" +
			"<dt>Generator</dt><dd>" + esc(GENS[r[C.gen]]) + "</dd><dt>Section</dt><dd>" + esc(SECS[r[C.sec]][1]) + "</dd>" +
			"<dt>File</dt><dd><code>" + esc(fileOf(r)) + "</code></dd>" +
			"<dt>Meta description</dt><dd>" + (r[C.dl] ? r[C.dl] + " characters" : "none") + "</dd><dt>h1 / words / size</dt><dd>" + r[C.h1] + " h1 · " + fmt(r[C.words]) + " words · " + (r[C.bytes] / 1024).toFixed(1) + " KB</dd>" +
			"<dt>Features</dt><dd>" + (featList(r[C.feat]).join(", ") || "none") + "</dd>" +
			"<dt>Issues</dt><dd>" + (iss.length ? iss.map(function (x) { return esc(x[1]); }).join("<br>") : "none") + "</dd>" +
			(bad ? "<dt>Broken references</dt><dd>" + bad.map(function (b) { return "<code>" + esc(b) + "</code>"; }).join("<br>") + (bad.length >= 4 ? "<br>… and possibly more" : "") + "</dd>" : "") +
			'</dl><p><a class="tu-btn" href="' + esc(url) + '" target="_blank" rel="noopener">Open page</a> <button type="button" class="tu-btn tu-btn--ghost" data-copy="' + esc(fileOf(r)) + '">Copy file path</button></p></div></td>';
	}
	function renderTable(rows) {
		var n = S.n, pages = Math.max(1, Math.ceil(rows.length / n));
		if (S.p > pages) S.p = pages;
		var from = (S.p - 1) * n, slice = rows.slice(from, from + n);
		if (!rows.length) { view.innerHTML = '<div class="tu-card si-empty"><p>No pages match these filters.</p><button type="button" class="tu-btn" id="si-empty-clear">Clear filters</button></div>'; var b = $("si-empty-clear"); if (b) b.onclick = function () { $("si-clear").click(); }; return; }
		var pager = function () {
			return '<div class="si-pager"><button type="button" class="tu-btn tu-btn--ghost" data-pg="-1"' + (S.p <= 1 ? " disabled" : "") + '>‹ Previous</button><span>Page ' + S.p + " of " + pages + " · rows " + fmt(from + 1) + "–" + fmt(Math.min(rows.length, from + n)) + '</span><button type="button" class="tu-btn tu-btn--ghost" data-pg="1"' + (S.p >= pages ? " disabled" : "") + '>Next ›</button>' +
				'<label class="si-ps">Rows <select class="tu-select" data-ps>' + [50, 100, 250, 500].map(function (x) { return '<option value="' + x + '"' + (x === n ? " selected" : "") + ">" + x + "</option>"; }).join("") + '</select></label>' +
				'<label class="si-minor"><input type="checkbox" data-minor' + (S.minor ? " checked" : "") + "> Show minor issues</label></div>";
		};
		view.innerHTML = pager() + '<div class="si-tablewrap"><table class="si-table"><thead><tr>' + sortHead("url", "URL") + sortHead("title", "Title") + sortHead("section", "Section") + sortHead("template", "Template") + sortHead("generator", "Generator") +
			sortHead("features", "Features") + sortHead("issues", "Issues") + sortHead("words", "Words", "num") + sortHead("date", "Updated") + "</tr></thead><tbody>" + slice.map(function (r, k) { return rowHTML(r, from + k); }).join("") + "</tbody></table></div>" + pager();
		view.onclick = function (e) {
			var t = e.target;
			var sb = t.closest("[data-sort]"); if (sb) { var k = sb.getAttribute("data-sort"); if (S.sort === k) S.dir = S.dir === "asc" ? "desc" : "asc"; else { S.sort = k; S.dir = (k === "words" || k === "bytes" || k === "date" || k === "features" || k === "issues") ? "desc" : "asc"; } S.p = 1; render(); writeURL(true); return; }
			var pg = t.closest("[data-pg]"); if (pg) { S.p += parseInt(pg.getAttribute("data-pg"), 10); render(); writeURL(true); view.scrollIntoView({ block: "start" }); return; }
			var ex = t.closest("[data-exp]"); if (ex) { toggleDetail(ex, rows); return; }
			var cp = t.closest("[data-copy]"); if (cp) { copy(cp.getAttribute("data-copy"), "File path copied"); return; }
			pick(t);
		};
		view.onchange = function (e) {
			var t = e.target;
			if (t.hasAttribute("data-ps")) { S.n = parseInt(t.value, 10); S.p = 1; render(); writeURL(true); }
			else if (t.hasAttribute("data-minor")) { S.minor = t.checked; render(); writeURL(true); }
		};
	}
	function pick(t) {
		var a = t.closest("[data-pick-s],[data-pick-t],[data-pick-g]"); if (!a) return;
		if (a.hasAttribute("data-pick-s")) setFilters({ s: a.getAttribute("data-pick-s") }, false);
		else if (a.hasAttribute("data-pick-t")) setFilters({ t: a.getAttribute("data-pick-t") }, false);
		else setFilters({ g: a.getAttribute("data-pick-g") }, false);
	}
	function toggleDetail(btn, rows) {
		var tr = btn.closest("tr"), open = btn.getAttribute("aria-expanded") === "true";
		if (open) { var nx = tr.nextElementSibling; if (nx && nx.classList.contains("si-detailrow")) nx.remove(); btn.setAttribute("aria-expanded", "false"); btn.textContent = "▸"; return; }
		var d = document.createElement("tr"); d.className = "si-detailrow"; d.innerHTML = detailHTML(rows[parseInt(btn.getAttribute("data-exp"), 10)]);
		tr.parentNode.insertBefore(d, tr.nextSibling); btn.setAttribute("aria-expanded", "true"); btn.textContent = "▾";
	}

	/* grouped view */
	var groupOpen = {};
	function renderGroups(rows) {
		var gb = S.gb, keyOf = gb === "template" ? function (r) { return TPLS[r[C.tpl]][1]; } : gb === "generator" ? function (r) { return GENS[r[C.gen]]; } : function (r) { return SECS[r[C.sec]][1]; };
		var map = {}, order = [];
		rows.forEach(function (r) { var k = keyOf(r); if (!map[k]) { map[k] = []; order.push(k); } map[k].push(r); });
		order.sort(function (a, b) { return map[b].length - map[a].length; });
		var CAP = 150;
		var head = '<div class="si-grouphead"><span class="si-gbl">Group by</span><div class="tu-seg" id="si-gb" role="group" aria-label="Group by">' +
			["section", "template", "generator"].map(function (g) { return '<button type="button" data-gb="' + g + '" aria-pressed="' + (S.gb === g) + '">' + g[0].toUpperCase() + g.slice(1) + "</button>"; }).join("") +
			'</div><button type="button" class="tu-btn tu-btn--ghost" data-all="open">Expand all</button><button type="button" class="tu-btn tu-btn--ghost" data-all="close">Collapse all</button></div>';
		if (!rows.length) { view.innerHTML = head + '<div class="tu-card si-empty"><p>No pages match these filters.</p></div>'; view.onclick = bindGroupHeadClick; view.onchange = null; return; }
		view.innerHTML = head + order.map(function (k) {
			var list = map[k], id = gb + ":" + k, open = groupOpen[id] === undefined ? order.length <= 1 : groupOpen[id];
			var issues = list.filter(function (r) { return r[C.iss] & HARD; }).length;
			return '<details class="si-group" data-gid="' + esc(id) + '"' + (open ? " open" : "") + "><summary><span class=\"si-gname\">" + esc(k) + '</span><span class="si-gn">' + fmt(list.length) + " pages" + (issues ? ' · <span class="si-gi">' + fmt(issues) + " with red issues</span>" : "") + '</span></summary><div class="si-gbody" data-fill="' + esc(id) + '"></div></details>';
		}).join("");
		function fillGroup(det) {
			var body = det.querySelector(".si-gbody"); if (body.getAttribute("data-done")) return;
			var id = det.getAttribute("data-gid"), k = id.slice(id.indexOf(":") + 1), list = map[k] || [], all = body.getAttribute("data-all") === "1", show = all ? list : list.slice(0, CAP);
			body.innerHTML = '<ul class="si-glist">' + show.map(function (r) {
				var t = TPLS[r[C.tpl]];
				return '<li><a class="si-url" href="' + esc(r[C.url]) + '" target="_blank" rel="noopener">' + esc(r[C.url]) + '</a><span class="si-gt">' + esc(r[C.title]) + "</span>" + (gb !== "template" ? pill(t[1], t[0] === "unclassified" ? "is-hard" : "is-tpl") : "") + issPills(r).replace(/<span class="si-ok"[^>]*>ok<\/span>/, "") + "</li>";
			}).join("") + "</ul>" + (list.length > show.length ? '<button type="button" class="tu-btn tu-btn--ghost si-more" data-more="' + esc(id) + '">Show all ' + fmt(list.length) + "</button>" : "");
			body.setAttribute("data-done", "1");
		}
		Array.prototype.forEach.call(view.querySelectorAll("details.si-group"), function (d) { if (d.open) fillGroup(d); d.addEventListener("toggle", function () { groupOpen[d.getAttribute("data-gid")] = d.open; if (d.open) fillGroup(d); }); });
		view.onclick = function (e) {
			var m = e.target.closest("[data-more]"); if (m) { var det = m.closest("details"), body = det.querySelector(".si-gbody"); body.setAttribute("data-all", "1"); body.removeAttribute("data-done"); fillGroup(det); return; }
			bindGroupHeadClick(e);
		};
		view.onchange = null;
	}
	function bindGroupHeadClick(e) {
		var g = e.target.closest("[data-gb]"); if (g) { S.gb = g.getAttribute("data-gb"); render(); writeURL(true); return; }
		var a = e.target.closest("[data-all]"); if (a) { var open = a.getAttribute("data-all") === "open"; Array.prototype.forEach.call(view.querySelectorAll("details.si-group"), function (d) { d.open = open; }); }
	}

	/* URL tree */
	function renderTree(rows) {
		if (!rows.length) { view.innerHTML = '<div class="tu-card si-empty"><p>No pages match these filters.</p></div>'; view.onclick = null; return; }
		var rootN = { name: "", path: "", kids: {}, row: null, n: 0 };
		rows.forEach(function (r) {
			var segs = r[C.url] === "/" ? [] : r[C.url].replace(/^\//, "").split("/"), node = rootN; node.n++;
			segs.forEach(function (s, i) { if (!node.kids[s]) node.kids[s] = { name: s, path: "/" + segs.slice(0, i + 1).join("/"), kids: {}, row: null, n: 0 }; node = node.kids[s]; node.n++; });
			node.row = r;
		});
		var topLeaves = [], topFolders = [];
		Object.keys(rootN.kids).sort().forEach(function (k) { var nd = rootN.kids[k]; (Object.keys(nd.kids).length ? topFolders : topLeaves).push(nd); });
		function label(nd) {
			var r = nd.row, t = r ? TPLS[r[C.tpl]] : null;
			return (r ? '<a class="si-url" href="' + esc(nd.path || "/") + '" target="_blank" rel="noopener">' + esc(nd.name ? "/" + nd.name : "/") + "</a>" : '<span class="si-fold">' + esc("/" + nd.name) + "/</span>") +
				(r ? '<span class="si-gt">' + esc(r[C.title]) + "</span>" + pill(t[1], t[0] === "unclassified" ? "is-hard" : "is-tpl") + (r[C.iss] & HARD ? pill("issue", "is-hard", issList(r[C.iss]).filter(function (x) { return x[2]; }).map(function (x) { return x[1]; }).join(", ")) : "") : "") +
				(Object.keys(nd.kids).length ? '<span class="si-gn">' + fmt(nd.n) + " page" + (nd.n === 1 ? "" : "s") + "</span>" : "");
		}
		var uid = 0, nodes = {};
		function li(nd) {
			var has = Object.keys(nd.kids).length, id = "n" + (uid++); nodes[id] = nd;
			return "<li" + (has ? ' class="has-kids"' : "") + ">" + (has ? '<button type="button" class="si-tg" aria-expanded="false" data-n="' + id + '" aria-label="Expand ' + esc(nd.path) + '">▸</button>' : '<span class="si-tg si-tg--leaf"></span>') + label(nd) + "</li>";
		}
		var html = '<div class="si-treehead"><button type="button" class="tu-btn tu-btn--ghost" data-tall="open">Expand folders</button><button type="button" class="tu-btn tu-btn--ghost" data-tall="close">Collapse all</button><span class="si-mut">Folders of the URL space, with page counts. Single top-level pages are grouped.</span></div>';
		html += '<ul class="si-tree" id="si-tree-root">';
		if (rootN.row) html += "<li>" + '<span class="si-tg si-tg--leaf"></span>' + label({ name: "", path: "/", kids: {}, row: rootN.row, n: 1 }) + "</li>";
		html += topFolders.map(li).join("");
		html += '<li class="has-kids"><button type="button" class="si-tg" aria-expanded="false" data-n="top">▸</button><span class="si-fold">Top-level pages</span><span class="si-gn">' + fmt(topLeaves.length) + " pages</span></li>";
		html += "</ul>";
		view.innerHTML = html;
		nodes.top = { kids: {}, leaves: topLeaves };
		function expand(btn) {
			var liEl = btn.closest("li"), open = btn.getAttribute("aria-expanded") === "true";
			if (open) { var u = liEl.querySelector(":scope > ul"); if (u) u.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.textContent = "▸"; return; }
			var ul = liEl.querySelector(":scope > ul");
			if (!ul) {
				var nd = nodes[btn.getAttribute("data-n")];
				ul = document.createElement("ul"); ul.className = "si-tree";
				if (nd.leaves) ul.innerHTML = nd.leaves.map(li).join("");
				else {
					ul.innerHTML = (nd.row ? "<li>" + '<span class="si-tg si-tg--leaf"></span>' + label({ name: nd.name, path: nd.path, kids: {}, row: nd.row, n: 1 }).replace("</a>", " <span class=\"si-mut\">(this folder's own page)</span></a>") + "</li>" : "") +
						Object.keys(nd.kids).sort(function (a, b) { var ka = Object.keys(nd.kids[a].kids).length > 0, kb = Object.keys(nd.kids[b].kids).length > 0; return ka === kb ? (a < b ? -1 : 1) : (ka ? -1 : 1); }).map(function (k) { return li(nd.kids[k]); }).join("");
				}
				liEl.appendChild(ul);
			}
			ul.hidden = false; btn.setAttribute("aria-expanded", "true"); btn.textContent = "▾";
		}
		view.onclick = function (e) {
			var b = e.target.closest(".si-tg[data-n]"); if (b) { expand(b); return; }
			var all = e.target.closest("[data-tall]");
			if (all) { var open = all.getAttribute("data-tall") === "open"; Array.prototype.forEach.call(view.querySelectorAll("#si-tree-root > li > .si-tg[data-n]"), function (x) { if ((x.getAttribute("aria-expanded") === "true") !== open) expand(x); }); if (!open) Array.prototype.forEach.call(view.querySelectorAll(".si-tg[aria-expanded=true]"), function (x) { expand(x); }); }
		};
		view.onchange = null;
	}

	/* template gallery */
	function renderTemplates() {
		var ct = counts(function (r) { return r[C.tpl]; }, TPLS.length);
		var cards = TPLS.map(function (t, i) {
			if (!ct[i] && t[0] === "unclassified") return "";
			var rows = ROWS.filter(function (r) { return r[C.tpl] === i; }), secs = {}, gens = {};
			rows.forEach(function (r) { var s = SECS[r[C.sec]][1], g = GENS[r[C.gen]]; secs[s] = (secs[s] || 0) + 1; gens[g] = (gens[g] || 0) + 1; });
			var top = function (m) { return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 3).map(function (k) { return esc(k) + " (" + fmt(m[k]) + ")"; }).join(", "); };
			var ex = (t[3] || []).map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + "</a>"; }).join(" · ");
			var iss = rows.filter(function (r) { return r[C.iss] & HARD; }).length;
			return '<article class="tu-card si-tcard' + (ct[i] ? "" : " is-unused") + (t[0] === "unclassified" ? " is-bad" : "") + '"><h3>' + esc(t[1]) + ' <span class="si-tcount">' + fmt(ct[i]) + "</span></h3><p class=\"si-tdesc\">" + esc(t[2]) + "</p>" +
				(ct[i] ? '<p class="si-tmeta"><b>Where:</b> ' + top(secs) + "<br><b>Generated by:</b> " + top(gens) + (iss ? '<br><b>Red issues:</b> ' + fmt(iss) + " page" + (iss === 1 ? "" : "s") : "") + '</p><p class="si-tex"><b>Examples:</b> ' + (ex || "none") + '</p><p><button type="button" class="tu-btn" data-show-t="' + esc(t[0]) + '">Show all ' + fmt(ct[i]) + " pages</button></p>" : '<p class="si-tmeta si-mut">No page uses this today (the rule stays for new pages).</p>') + "</article>";
		}).join("");
		view.innerHTML = '<p class="tu-note si-intro">One card per template, in rule order. Each page is assigned to the first rule that matches (see <button type="button" class="si-link" data-v="rules">How pages are classified</button>).</p><div class="si-tgrid">' + cards + "</div>";
		view.onclick = function (e) {
			var b = e.target.closest("[data-show-t]"); if (b) { S.v = "table"; setFilters({ t: b.getAttribute("data-show-t") }, true); return; }
			var v = e.target.closest("[data-v]"); if (v) { S.v = v.getAttribute("data-v"); render(); writeURL(true); }
		};
		view.onchange = null;
	}

	/* how pages are classified */
	function renderRules() {
		var total = ROWS.length, ct = counts(function (r) { return r[C.tpl]; }, TPLS.length);
		var rules = "<ol class=\"si-rules\">" + TPLS.map(function (t, i) { return '<li><b>' + esc(t[1]) + '</b> <code>' + esc(t[0]) + '</code> <span class="si-tcount">' + fmt(ct[i]) + "</span><br>" + esc(t[2]) + "</li>"; }).join("") + "</ol>";
		var feats = '<table class="si-def"><thead><tr><th>Feature</th><th>Detected by</th><th class="num">Pages</th></tr></thead><tbody>' + FEATS.map(function (f, i) { var n = ROWS.filter(function (r) { return r[C.feat] & (1 << i); }).length; return "<tr><th scope=\"row\">" + esc(f[1]) + "</th><td>" + esc(f[2]) + '</td><td class="num">' + fmt(n) + " (" + pct(n, total) + "%)</td></tr>"; }).join("") + "</tbody></table>";
		var iss = '<table class="si-def"><thead><tr><th>Issue</th><th>Severity</th><th class="num">Pages</th></tr></thead><tbody>' + ISSUES.map(function (f, i) { var n = ROWS.filter(function (r) { return r[C.iss] & (1 << i); }).length; return "<tr><th scope=\"row\">" + esc(f[1]) + "</th><td>" + (f[2] ? "red (worth fixing)" : "amber (minor / may be intentional)") + '</td><td class="num">' + fmt(n) + "</td></tr>"; }).join("") + "</tbody></table>";
		var un = ROWS.filter(function (r) { return r[C.tpl] === TPLS.length - 1; });
		view.innerHTML = '<div class="tu-card si-howto"><h2>How pages are classified</h2>' +
			"<p>Every HTML page under <code>mes.fm/</code> is read by <code>build_site_index.py</code> and given <b>one template</b> (the page shell / layout), <b>one generator</b> (what writes the file) and <b>one section</b>. Templates are decided by ordered rules over the page's own markup (element ids, classes, scripts and markers), and the <b>first rule that matches wins</b>, so the order below matters. A page no rule matches is shown as <b>Unclassified</b>: that means a new kind of page, or one that drifted from every shell.</p>" +
			"<h3>Template rules, in order</h3>" + rules +
			"<p>Generators are learned from the repo: keys of <code>APPS</code> in build_tool_apps.py, every directory and <code>slug:</code> a <code>build.mjs</code> writes, the Math Q/A records in math_qa_mirrors.json, the Nancy report builder. A page whose shell is not one its generator emits is flagged <i>shell does not match generator</i>.</p>" +
			"<h3>Features</h3>" + feats + "<h3>Issues</h3>" + iss +
			'<h3>Unclassified pages</h3>' + (un.length ? "<ul class=\"si-glist\">" + un.map(function (r) { return '<li><a class="si-url" href="' + esc(r[C.url]) + '" target="_blank" rel="noopener">' + esc(r[C.url]) + '</a><span class="si-gt">' + esc(r[C.title]) + "</span></li>"; }).join("") + "</ul>" : "<p>None: every page matched a rule.</p>") +
			"<h3>Refreshing</h3><p>Run <code>python3 build_sitemap.py</code> then <code>python3 build_site_index.py --apply</code> after structural passes, new pages or rebuilds, then commit <code>mes.fm/site-index/pages.json</code>. The numbers above are as of the generated date at the top of the page.</p></div>";
		view.onclick = null; view.onchange = null;
	}

	/* ------------------------------------------------------------------ boot */
	function boot(data) {
		D = data; ROWS = D.p; TPLS = D.templates; SECS = D.sections; GENS = D.generators; FEATS = D.features; ISSUES = D.issues; BAD = D.bad || {};
		ISSUES.forEach(function (it, i) { if (it[2]) HARD |= 1 << i; });
		ROWS.forEach(function (r) { r._h = (r[C.url] + " " + r[C.title]).toLowerCase(); });
		var htk = ROWS.filter(function (r) { return TPLS[r[C.tpl]][0] === "httrack"; }).length;
		$("si-fresh").innerHTML = "Generated <b>" + esc(D.generated || "?") + "</b> from <b>" + fmt(ROWS.length) + "</b> pages (" + fmt(ROWS.length - htk) + " deployed, " + fmt(htk) + " legacy HTTrack capture" + (htk === 1 ? "" : "s") + "). Re-run <code>python3 build_site_index.py --apply</code> to refresh. <a href=\"" + DATA_URL + "\">Raw JSON</a>";
		S = readURL();
		fillSelects(); bindControls(); renderDash();
		$("si-dash").hidden = false; $("si-controls").hidden = false;
		syncControls(); render();
	}
	function start() {
		fetch(DATA_URL, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(boot).catch(function (err) {
			$("si-fresh").innerHTML = "Could not load <a href=\"" + DATA_URL + "\">pages.json</a> (" + esc(err.message || err) + "). Run <code>python3 build_site_index.py --apply</code>.";
		});
	}
	if (document.readyState === "complete") start(); else window.addEventListener("load", start);
})();
