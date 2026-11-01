/* MES Polls -- mes.fm/polls (UI; helpers in lib.js = MESPoll; server = mes.fm/api/poll.js).
 * A poll is opened with /polls?p=<id> (the public short address mes.fm/v/<id> is a vercel.json rewrite to it); a manager link adds #k=<key>.
 * localStorage "mes-polls:v1" = { vid: random browser id, mine: [{id, key, q, c}], voted: {id: [picks]} }; the maker's draft is "mes-polls:draft".
 * On localhost / 127.0.0.1 (no /api) or with ?mock=1 the page talks to an in-browser stand-in kept in localStorage "mes-polls:mock".
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pl"), P = window.MESPoll;
	if (!root || !P) return;
	var KEY = "mes-polls:v1", DKEY = "mes-polls:draft", T0 = Date.now();
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var NCOL = 10;

	function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
	function toast(msg) { var t = $("pl-toast"); if (!t) { t = el("div", "tu-toast"); t.id = "pl-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }
	function copy(text, done) {
		function fb() { var ta = el("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(done || "Copied"); } catch (e) { toast("Could not copy: select the text and copy it yourself"); } ta.remove(); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(done || "Copied"); }, fb); else fb();
	}

	/* ---------- saved state ---------- */
	var S = { vid: "", mine: [], voted: {} };
	function rnd() { var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
	function load() {
		try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { if (/^[a-f0-9]{32}$/.test(s.vid)) S.vid = s.vid; if (Array.isArray(s.mine)) S.mine = s.mine.filter(function (m) { return m && /^[a-z0-9]{8}$/.test(m.id); }).slice(0, 100); if (s.voted && typeof s.voted === "object") S.voted = s.voted; } } catch (e) {}
		if (!S.vid) S.vid = rnd();
	}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	load(); save();
	window.addEventListener("storage", function (e) { if (e.key === KEY) { load(); renderMine(); } });
	function mineOf(id) { for (var i = 0; i < S.mine.length; i++) if (S.mine[i].id === id) return S.mine[i]; return null; }

	/* ---------- server (or the local stand-in) ---------- */
	function api(method, body, id) {
		if (MOCK) return Promise.resolve(mockApi(method, body, id));
		var o = method === "GET" ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
		return fetch("/api/poll" + (method === "GET" ? "?id=" + encodeURIComponent(id) : ""), o).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { j._code = r.status; return j; });
		}, function () { return { _code: 0, error: "Could not reach mes.fm. Check your connection." }; });
	}
	function mockApi(method, b, id) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-polls:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-polls:mock", JSON.stringify(db)); };
		function pub(x, show) { var p = x.p, open = !p.x && now < (p.cl || p.c + 366 * 864e5); var o = { id: x.id, q: p.q, d: p.d, o: p.o, m: p.m, cl: p.cl, sh: p.sh, ch: p.ch, c: p.c, x: p.x, open: open, closes: p.x || p.cl || p.c + 366 * 864e5, now: now, v: x.v }; if (show || p.sh === "always" || !open) o.n = x.n.slice(); return o; }
		if (method === "GET") { var g = db[id]; return g ? Object.assign({ _code: 200 }, pub(g)) : { _code: 404, error: "poll not found" }; }
		if (b.act === "new") {
			var probs = P.problems({ q: b.q, o: b.o, cl: b.cl }); if (probs.length) return { _code: 400, error: probs[0] };
			var nid = rnd().replace(/[^a-z0-9]/g, "").slice(0, 8), key = rnd();
			db[nid] = { id: nid, k: key, p: { q: b.q.trim(), d: b.d || "", o: b.o, m: b.m, cl: b.cl, sh: b.sh, ch: b.ch, c: now, x: 0 }, n: b.o.map(function () { return 0; }), v: 0, b: {} }; put();
			return { _code: 200, id: nid, key: key };
		}
		var x = db[b.id]; if (!x) return { _code: 404, error: "poll not found" };
		var open = !x.p.x && now < (x.p.cl || x.p.c + 366 * 864e5);
		if (b.act === "vote") {
			if (!open) return { _code: 409, error: "this poll is closed", poll: pub(x) };
			var prev = x.b[b.vid];
			if (prev && !x.p.ch) return { _code: 409, error: "you already voted in this poll", mine: prev, poll: pub(x, x.p.sh === "voted") };
			if (prev) prev.forEach(function (i) { x.n[i]--; }); else x.v++;
			b.picks.forEach(function (i) { x.n[i]++; }); x.b[b.vid] = b.picks.slice().sort(); put();
			return { _code: 200, ok: true, mine: x.b[b.vid], changed: !!prev, poll: pub(x, x.p.sh !== "closed") };
		}
		var owner = b.key === x.k;
		if (b.act === "peek") { var mine = x.b[b.vid] || null; return { _code: 200, poll: pub(x, owner || (mine && x.p.sh === "voted")), mine: mine, owner: owner }; }
		if (!owner) return { _code: 403, error: "only the person who made this poll can do that" };
		if (b.act === "close") { x.p.x = now; put(); return { _code: 200, ok: true, poll: pub(x, true) }; }
		if (b.act === "del") { delete db[b.id]; put(); return { _code: 200, ok: true }; }
		return { _code: 400, error: "unknown action" };
	}
	function shareUrl(id) { return MOCK ? location.origin + "/polls?p=" + id : "https://mes.fm/v/" + id; }

	/* ---------- drawing a poll (used by the poll view and the preview) ---------- */
	function donut(n, tot, word) {
		var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
		svg.setAttribute("viewBox", "0 0 120 120"); svg.setAttribute("class", "pl-donut"); svg.setAttribute("role", "img");
		svg.setAttribute("aria-label", "Pie chart of the votes");
		var bg = document.createElementNS(NS, "circle"); bg.setAttribute("cx", 60); bg.setAttribute("cy", 60); bg.setAttribute("r", 46); bg.setAttribute("class", "pl-donut-bg"); svg.appendChild(bg);
		P.slices(n).forEach(function (s) {
			var path = document.createElementNS(NS, "path"), r = 46, a0 = s.a0, a1 = s.a1;
			if (a1 - a0 >= Math.PI * 2 - 1e-6) { var full = document.createElementNS(NS, "circle"); full.setAttribute("cx", 60); full.setAttribute("cy", 60); full.setAttribute("r", r); full.setAttribute("class", "pl-donut-full pl-s" + (s.i % NCOL)); svg.appendChild(full); return; }
			var x0 = 60 + r * Math.sin(a0), y0 = 60 - r * Math.cos(a0), x1 = 60 + r * Math.sin(a1), y1 = 60 - r * Math.cos(a1);
			path.setAttribute("d", "M" + x0.toFixed(2) + " " + y0.toFixed(2) + "A" + r + " " + r + " 0 " + (a1 - a0 > Math.PI ? 1 : 0) + " 1 " + x1.toFixed(2) + " " + y1.toFixed(2));
			path.setAttribute("class", "pl-slice pl-s" + (s.i % NCOL));
			svg.appendChild(path);
		});
		var c1 = document.createElementNS(NS, "text"); c1.setAttribute("x", 60); c1.setAttribute("y", 60); c1.setAttribute("class", "pl-donut-n"); c1.textContent = String(tot);
		var c2 = document.createElementNS(NS, "text"); c2.setAttribute("x", 60); c2.setAttribute("y", 76); c2.setAttribute("class", "pl-donut-l"); c2.textContent = (word || "vote") + (tot === 1 ? "" : "s");
		svg.appendChild(c1); svg.appendChild(c2);
		return svg;
	}
	function results(poll, mine) {
		var box = el("div", "pl-res"), n = poll.n, tot = n.reduce(function (a, b) { return a + b; }, 0), pc = P.percents(n, 0), lead = P.leaders(n);
		var bars = el("ol", "pl-bars");
		var order = n.map(function (_, i) { return i; });
		order.forEach(function (i) {
			var li = el("li", "pl-brow" + (lead.indexOf(i) >= 0 ? " pl-lead" : "") + (mine && mine.indexOf(i) >= 0 ? " pl-minepick" : ""));
			var top = el("div", "pl-btop");
			var lab = el("span", "pl-blab"); var sw = el("span", "pl-sw pl-b" + (i % NCOL)); sw.setAttribute("aria-hidden", "true"); lab.appendChild(sw); lab.appendChild(document.createTextNode(poll.o[i]));
			if (mine && mine.indexOf(i) >= 0) lab.appendChild(el("span", "pl-you", "your vote"));
			var num = el("span", "pl-bnum"); num.appendChild(el("strong", null, pc[i] + "%")); num.appendChild(document.createTextNode(" · " + n[i]));
			top.appendChild(lab); top.appendChild(num);
			var track = el("div", "pl-track"), fill = el("div", "pl-fill pl-b" + (i % NCOL)); fill.style.width = (tot ? n[i] / Math.max.apply(null, n) * 100 : 0) + "%";
			track.appendChild(fill);
			li.appendChild(top); li.appendChild(track);
			li.setAttribute("aria-label", poll.o[i] + ": " + n[i] + " (" + pc[i] + "%)" + (lead.indexOf(i) >= 0 ? ", most votes" : ""));
			bars.appendChild(li);
		});
		box.appendChild(bars);
		var side = el("div", "pl-side"); side.appendChild(donut(n, tot, poll.m > 1 ? "pick" : "vote"));
		box.appendChild(side);
		var t = el("p", "pl-tot");
		var v = poll.v || 0;
		t.textContent = poll.m > 1 ? v + (v === 1 ? " person" : " people") + " voted · " + tot + (tot === 1 ? " pick" : " picks") : v + (v === 1 ? " person" : " people") + " voted";
		if (lead.length && tot) t.textContent += lead.length > 1 ? " · tie for first" : " · leading: " + poll.o[lead[0]];
		box.appendChild(t);
		return box;
	}
	function hiddenNote(poll, mine) {
		if (poll.sh === "voted" && !mine) return "Vote to see the results.";
		if (poll.sh === "closed") return "The results are shown when voting ends." + (poll.v ? " " + poll.v + (poll.v === 1 ? " person has" : " people have") + " voted so far." : "");
		return "";
	}
	/** draw into box: o = {mine, mode: "vote"|"res", preview, onVote(picks), busy} */
	function drawPoll(box, poll, o) {
		box.textContent = "";
		var h = el(o.preview ? "h3" : "h2", "pl-q", poll.q || "Your question"); if (!o.preview) h.id = "pl-q"; if (!poll.q) h.classList.add("pl-ph");
		box.appendChild(h);
		if (poll.d) box.appendChild(el("p", "pl-d", poll.d));
		if (o.mode === "res") {
			if (poll.n) box.appendChild(results(poll, o.mine));
			else box.appendChild(el("p", "pl-hidden", hiddenNote(poll, o.mine)));
			if (o.mine && !o.preview) {
				var y = el("p", "pl-yours"); y.textContent = "Your vote: " + o.mine.map(function (i) { return poll.o[i]; }).join(", ");
				box.appendChild(y);
			}
			return;
		}
		box.appendChild(el("p", "pl-hint", poll.m > 1 ? "Pick up to " + poll.m + "." : "Pick one."));
		var form = el("form", "pl-opts"), name = "pl-v" + Math.random().toString(36).slice(2, 7), type = poll.m > 1 ? "checkbox" : "radio";
		form.setAttribute("aria-label", "Options");
		var opts = poll.o.length ? poll.o : ["Option 1", "Option 2"];
		opts.forEach(function (t, i) {
			var lab = el("label", "pl-opt"), inp = el("input"); inp.type = type; inp.name = name; inp.value = i;
			if (o.mine && o.mine.indexOf(i) >= 0) inp.checked = true;
			if (o.preview) inp.tabIndex = -1;
			lab.appendChild(inp); var mk = el("span", "pl-mark pl-b" + (i % NCOL)); mk.setAttribute("aria-hidden", "true"); lab.appendChild(mk); lab.appendChild(el("span", "pl-otext", t));
			if (!poll.o.length) lab.classList.add("pl-ph");
			form.appendChild(lab);
		});
		var row = el("div", "pl-vrow"), btn = el("button", "tu-btn tu-btn--primary pl-vote", o.mine ? "Change my vote" : "Vote"); btn.type = "submit";
		var cnt = el("span", "pl-sel");
		row.appendChild(btn); row.appendChild(cnt);
		if (o.cancel) { var cb = el("button", "tu-btn tu-btn--ghost", "Cancel"); cb.type = "button"; cb.addEventListener("click", o.cancel); row.appendChild(cb); }
		form.appendChild(row);
		function sync() {
			var picked = form.querySelectorAll("input:checked").length;
			if (type === "checkbox") Array.prototype.forEach.call(form.querySelectorAll("input"), function (x) { x.disabled = !x.checked && picked >= poll.m; x.parentNode.classList.toggle("pl-off", x.disabled); });
			Array.prototype.forEach.call(form.querySelectorAll("input"), function (x) { x.parentNode.classList.toggle("pl-on", x.checked); });
			btn.disabled = !picked || !!o.busy;
			cnt.textContent = type === "checkbox" ? picked + " of " + poll.m + " picked" : "";
		}
		form.addEventListener("change", sync);
		form.addEventListener("submit", function (e) {
			e.preventDefault(); if (o.preview) return;
			var picks = Array.prototype.map.call(form.querySelectorAll("input:checked"), function (x) { return +x.value; });
			if (picks.length && o.onVote) o.onVote(picks, btn);
		});
		box.appendChild(form);
		sync();
	}

	/* ---------- the poll view ---------- */
	var V = { id: null, poll: null, mine: null, owner: false, key: "", skew: 0, editing: false, timer: 0, tick: 0, busy: false, lastFetch: 0 };
	function msg(text, kind) { var m = $("pl-msg"); m.textContent = text || ""; m.hidden = !text; m.className = "tu-card pl-msg" + (kind ? " pl-msg--" + kind : ""); }
	function statusText(p) {
		var now = Date.now() + V.skew;
		if (!p.open || p.closes <= now) return [["Closed", "pl-chip--closed"], [p.x ? "closed " + fmtDate(p.x) : "ended " + fmtDate(p.closes), ""]];
		if (!p.cl) return [["Open", "pl-chip--open"], ["until the creator closes it", ""]];
		return [["Open", "pl-chip--open"], ["closes in " + P.left(p.closes - now), "pl-cd"], [fmtDate(p.closes), "pl-chip--when"]];
	}
	function fmtDate(ms) { try { return new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return new Date(ms).toString(); } }
	function paintStatus() {
		var p = V.poll, s = $("pl-status"); if (!p) return;
		s.textContent = "";
		statusText(p).forEach(function (c) { s.appendChild(el("span", "pl-chip " + c[1], c[0])); });
		if (p.m > 1) s.appendChild(el("span", "pl-chip", "up to " + p.m + " picks"));
		if (V.owner) s.appendChild(el("span", "pl-chip pl-chip--own", "your poll"));
		var now = Date.now() + V.skew;
		if (p.open && p.cl && p.closes <= now && !V.busy && Date.now() - V.lastFetch > 1500) refresh();
	}
	function paintView() {
		var p = V.poll; if (!p) return;
		var now = Date.now() + V.skew, open = p.open && p.closes > now;
		var showForm = open && (!V.mine || V.editing);
		drawPoll($("pl-poll"), p, {
			mine: V.mine, mode: showForm ? "vote" : "res", busy: V.busy, onVote: vote,
			cancel: V.editing ? function () { V.editing = false; paintView(); } : null
		});
		if (!showForm && open && V.mine && p.ch) {
			var cb = el("button", "tu-btn pl-change", "Change my vote"); cb.type = "button";
			cb.addEventListener("click", function () { V.editing = true; paintView(); });
			$("pl-poll").appendChild(cb);
		}
		if (showForm && p.n && p.sh === "always" && !V.editing) {
			var peek = el("details", "pl-peek"), s = el("summary", null, "See the results so far"); peek.appendChild(s); peek.appendChild(results(p, null));
			$("pl-poll").appendChild(peek);
		}
		if (V.owner && showForm && !V.editing && p.sh !== "always") {
			var own = el("button", "tu-btn tu-btn--ghost pl-change", "Show me the results (you made this poll)"); own.type = "button";
			own.addEventListener("click", function () { V.ownerView = true; paintView(); });
			if (!V.ownerView) $("pl-poll").appendChild(own);
		}
		if (V.owner && V.ownerView && showForm && p.n) { $("pl-poll").appendChild(results(p, null)); }
		$("pl-close").hidden = !(V.owner && open);
		$("pl-del").hidden = !V.owner;
		var note = [];
		if (open && p.ch) note.push("You can change your vote while the poll is open.");
		if (open && !p.ch && !V.mine) note.push("You can vote once.");
		if (p.sh === "voted") note.push("Results are shown to people who have voted.");
		if (p.sh === "closed" && open) note.push("Results are shown when voting ends.");
		if (open && (p.n || V.owner)) note.push("Results update by themselves.");
		$("pl-vnote").textContent = note.join(" ");
		paintStatus();
	}
	function accept(j) {
		if (j.poll || j.q) { var p = j.poll || j; V.skew = (p.now || Date.now()) - Date.now(); V.poll = p; }
		if (j.mine !== undefined && j.mine) { V.mine = j.mine; S.voted[V.id] = j.mine; save(); }
		if (j.owner !== undefined) V.owner = j.owner || !!V.key;
		if (V.poll && mineOf(V.id)) { status[V.id] = V.poll; renderMine(); }
	}
	function refresh() {
		if (!V.id) return Promise.resolve();
		V.lastFetch = Date.now();
		var p = V.poll, usePeek = V.key || (p ? p.sh === "voted" && V.mine : V.mine);
		var req = usePeek ? api("POST", { act: "peek", id: V.id, vid: S.vid, key: V.key || undefined }) : api("GET", null, V.id);
		return req.then(function (j) {
			if (j._code === 404) { V.poll = null; $("pl-view").hidden = true; msg("This poll does not exist any more: it was deleted, or it closed more than 60 days ago.", "warn"); stopTimers(); var m = mineOf(V.id); if (m) { m.gone = true; save(); renderMine(); } return; }
			if (j._code !== 200) return;
			accept(j);
			if (!V.editing) paintView(); else paintStatus();
		});
	}
	function stopTimers() { clearInterval(V.timer); clearInterval(V.tick); V.timer = V.tick = 0; }
	function startTimers() {
		stopTimers();
		V.tick = setInterval(function () { if (V.poll && V.poll.open && V.poll.cl) { var cd = document.querySelector("#pl-status .pl-cd"); if (cd) cd.textContent = "closes in " + P.left(V.poll.closes - Date.now() - V.skew); if (V.poll.closes - Date.now() - V.skew <= 0) paintStatus(); } }, 1000);
		V.timer = setInterval(function () {
			if (document.hidden || !V.poll || V.busy || V.editing) return;
			var p = V.poll, open = p.open && p.closes > Date.now() + V.skew;
			if (!open) return;
			var every = (p.n || V.owner) ? 4000 : 15000;
			if (Date.now() - V.lastFetch >= every - 200) refresh();
		}, 1000);
	}
	function vote(picks, btn) {
		if (V.busy) return; V.busy = true; btn.disabled = true; btn.textContent = "Sending…";
		api("POST", { act: "vote", id: V.id, vid: S.vid, picks: picks, t: Date.now() - T0, hp: ($("pl-hp") || {}).value || "" }).then(function (j) {
			V.busy = false;
			if (j._code === 200) { accept(j); V.editing = false; toast(j.changed ? "Vote changed" : "Thanks, your vote is in"); }
			else { accept(j); toast(j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) : "Could not vote, try again"); if (j.mine) V.editing = false; }
			paintView();
		});
	}
	function openPoll(id) {
		V.id = id; V.mine = Array.isArray(S.voted[id]) ? S.voted[id] : null; var m = mineOf(id); V.key = m && m.key || ""; V.owner = !!V.key;
		$("pl-view").hidden = false; msg("");
		$("pl-poll").innerHTML = '<p class="pl-loading">Loading the poll…</p>';
		var meta = document.querySelector('meta[name="robots"]'); if (!meta) { meta = el("meta"); meta.name = "robots"; document.head.appendChild(meta); } meta.content = "noindex";
		$("pl-make-h").textContent = "Make your own poll";
		return refresh().then(function () { if (V.poll) { document.title = V.poll.q + " | MES Polls"; startTimers(); } });
	}
	function wireView() {
		$("pl-copy").addEventListener("click", function () { copy(shareUrl(V.id), "Link copied"); });
		$("pl-qrbtn").addEventListener("click", function () { qr($("pl-qr"), shareUrl(V.id)); });
		if (navigator.share) { $("pl-share").hidden = false; $("pl-share").addEventListener("click", function () { navigator.share({ title: V.poll ? V.poll.q : "Poll", text: V.poll ? V.poll.q : "", url: shareUrl(V.id) }).catch(function () {}); }); }
		$("pl-close").addEventListener("click", function () { if (confirm("Close this poll now? Nobody can vote after this, and it cannot be opened again.")) manage(V.id, "close"); });
		$("pl-del").addEventListener("click", function () { if (confirm("Delete this poll and all its votes for good?")) manage(V.id, "del"); });
		var hp = el("input"); hp.type = "text"; hp.id = "pl-hp"; hp.name = "website"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.className = "pl-hp"; hp.setAttribute("aria-hidden", "true"); root.appendChild(hp);
		function panel() { if (window.MESPanel) window.MESPanel.add($("pl-view"), { bar: $("pl-vbar") }); }
		if (window.MESPanel) panel(); else document.addEventListener("DOMContentLoaded", panel);
	}
	function manage(id, act) {
		var m = mineOf(id); if (!m) return;
		api("POST", { act: act, id: id, key: m.key }).then(function (j) {
			if (j._code === 200) {
				if (act === "del") { S.mine = S.mine.filter(function (x) { return x.id !== id; }); delete S.voted[id]; save(); toast("Poll deleted"); if (V.id === id) { V.poll = null; stopTimers(); $("pl-view").hidden = true; msg("The poll was deleted.", ""); } }
				else { toast("Poll closed"); if (V.id === id) { accept(j); paintView(); } }
				renderMine();
			} else if (j._code === 404) { m.gone = true; save(); renderMine(); toast("That poll no longer exists"); }
			else toast(j.error || "Could not do that, try again");
		});
	}

	/* ---------- QR code (qrcode-generator, loaded on first use) ---------- */
	var qrLib = null;
	function loadQr() {
		if (window.qrcode) return Promise.resolve(window.qrcode);
		if (qrLib) return qrLib;
		qrLib = new Promise(function (ok, no) { var s = el("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"; s.onload = function () { ok(window.qrcode); }; s.onerror = function () { qrLib = null; no(); }; document.head.appendChild(s); });
		return qrLib;
	}
	function qr(box, url) {
		if (!box.hidden && box.dataset.url === url) { box.hidden = true; return; }
		box.hidden = false; box.dataset.url = url; box.textContent = "Making the QR code…";
		loadQr().then(function (q) {
			var c = q(0, "M"); c.addData(url); c.make();
			box.innerHTML = '<div class="pl-qrimg">' + c.createSvgTag({ cellSize: 6, margin: 3, scalable: true }) + "</div>";
			var p = el("p", "tu-note", "Scan it with a phone camera to open " + url.replace(/^https?:\/\//, "") + "."); box.appendChild(p);
			var a = el("a", "tu-btn", "Download the QR code"); a.download = "poll-qr.svg";
			a.href = URL.createObjectURL(new Blob([c.createSvgTag({ cellSize: 10, margin: 4 })], { type: "image/svg+xml" })); box.appendChild(a);
		}, function () { box.textContent = "Could not load the QR code maker. Check your connection."; });
	}

	/* ---------- My polls ---------- */
	var status = {};
	function renderMine() {
		var list = $("pl-mine"), on = S.mine.length > 0;
		$("pl-mine-h").hidden = $("pl-mine-card").hidden = !on;
		if (!on) return;
		list.textContent = "";
		var ul = el("ul", "pl-mlist");
		S.mine.slice().sort(function (a, b) { return b.c - a.c; }).forEach(function (m) {
			var li = el("li", "pl-mrow" + (m.gone ? " pl-gone" : ""));
			var a = el("a", "pl-mq", m.q || m.id); a.href = (MOCK ? "/polls?p=" : "/v/") + m.id;
			var info = el("span", "pl-minfo");
			var st = status[m.id];
			info.textContent = m.gone ? "gone (deleted or expired)" : st ? (st.open && st.closes > Date.now() ? "open" + (st.cl ? ", closes in " + P.left(st.closes - Date.now()) : "") : "closed") + " · " + st.v + (st.v === 1 ? " vote" : " votes") : "made " + fmtDate(m.c);
			var btns = el("span", "pl-mbtns");
			function b(txt, fn, cls) { var x = el("button", "tu-btn " + (cls || ""), txt); x.type = "button"; x.addEventListener("click", fn); btns.appendChild(x); }
			if (!m.gone) {
				b("Copy link", function () { copy(shareUrl(m.id), "Link copied"); });
				if (!st || st.open) b("Close", function () { if (confirm("Close \"" + (m.q || m.id) + "\" now? Nobody can vote after this.")) manage(m.id, "close"); });
				b("Delete", function () { if (confirm("Delete \"" + (m.q || m.id) + "\" and all its votes for good?")) manage(m.id, "del"); }, "pl-danger");
			} else b("Remove from list", function () { S.mine = S.mine.filter(function (x) { return x.id !== m.id; }); save(); renderMine(); });
			li.appendChild(a); li.appendChild(info); li.appendChild(btns);
			ul.appendChild(li);
		});
		list.appendChild(ul);
	}
	function loadStatuses() {
		S.mine.slice().sort(function (a, b) { return b.c - a.c; }).slice(0, 12).forEach(function (m) {
			if (m.gone) return;
			api("POST", { act: "peek", id: m.id, key: m.key }).then(function (j) {
				if (j._code === 404) { m.gone = true; save(); }
				else if (j._code === 200 && j.poll) status[m.id] = j.poll;
				renderMine();
			});
		});
	}

	/* ---------- the maker ---------- */
	var D = { q: "", d: "", o: ["", ""], kind: "one", m: 2, end: "manual", dur: 1, unit: "day", date: "", time: "", sh: "always", ch: false };
	var pv = "vote";
	try { var dd = JSON.parse(localStorage.getItem(DKEY) || "null"); if (dd && typeof dd === "object") for (var k in D) if (dd[k] !== undefined && typeof dd[k] === typeof D[k]) D[k] = dd[k]; } catch (e) {}
	if (!Array.isArray(D.o) || D.o.length < 2) D.o = ["", ""];
	function saveDraft() { try { localStorage.setItem(DKEY, JSON.stringify(D)); } catch (e) {} }
	function opts() { return D.o.map(function (x) { return String(x || "").trim(); }).filter(Boolean); }
	function closeMs() {
		if (D.end === "after") { var ms = P.durMs(D.dur, D.unit); return ms > 0 ? Date.now() + ms : NaN; }
		if (D.end === "at") { if (!D.date) return NaN; var t = new Date(D.date + "T" + (D.time || "23:59")); return isNaN(t) ? NaN : t.getTime(); }
		return 0;
	}
	function draftPoll() {
		var o = opts(), m = D.kind === "many" ? Math.min(D.m, Math.max(2, o.length)) : 1, cl = closeMs();
		return { q: D.q.trim(), d: D.d.trim(), o: o, m: m, cl: isNaN(cl) ? 0 : cl, sh: D.sh, ch: D.ch, open: true, closes: cl || Date.now() + 366 * 864e5, v: 0 };
	}
	function demoCounts(n) { var base = [7, 4, 3, 2, 2, 1]; var out = []; for (var i = 0; i < n; i++) out.push(base[i] !== undefined ? base[i] : 1); return out; }
	function renderOptions(focusIdx) {
		var ol = $("pl-olist"); ol.textContent = "";
		while (D.o.length < 20 && D.o[D.o.length - 1] && D.o[D.o.length - 1].trim()) D.o.push("");
		D.o.forEach(function (v, i) {
			var li = el("li", "pl-oitem"), inp = el("input", "tu-input"); inp.type = "text"; inp.maxLength = 100; inp.value = v; inp.placeholder = "Option " + (i + 1); inp.setAttribute("aria-label", "Option " + (i + 1)); inp.autocomplete = "off";
			var sw = el("span", "pl-sw pl-b" + (i % NCOL)); sw.setAttribute("aria-hidden", "true");
			inp.addEventListener("input", function () { D.o[i] = inp.value; var last = i === D.o.length - 1; if (last && inp.value.trim() && D.o.length < 20) { D.o.push(""); renderOptions(i); } else changed(); });
			inp.addEventListener("keydown", function (e) {
				if (e.key === "Enter") { e.preventDefault(); var nx = ol.querySelectorAll("input")[i + 1]; if (nx) nx.focus(); else if (D.o.length < 20) { D.o.push(""); renderOptions(i + 1); } }
				if (e.key === "Backspace" && !inp.value && D.o.length > 2) { e.preventDefault(); D.o.splice(i, 1); renderOptions(Math.max(0, i - 1)); }
			});
			var up = el("button", "pl-ib", "↑"); up.type = "button"; up.title = "Move up"; up.setAttribute("aria-label", "Move option " + (i + 1) + " up"); up.disabled = i === 0;
			up.addEventListener("click", function () { var t = D.o[i]; D.o[i] = D.o[i - 1]; D.o[i - 1] = t; renderOptions(i - 1); });
			var rm = el("button", "pl-ib", "✕"); rm.type = "button"; rm.title = "Remove"; rm.setAttribute("aria-label", "Remove option " + (i + 1)); rm.disabled = D.o.length <= 2;
			rm.addEventListener("click", function () { D.o.splice(i, 1); if (D.o.length < 2) D.o.push(""); renderOptions(Math.min(i, D.o.length - 1)); });
			li.appendChild(sw); li.appendChild(inp); li.appendChild(up); li.appendChild(rm); ol.appendChild(li);
		});
		$("pl-oadd").disabled = D.o.length >= 20;
		if (focusIdx != null) { var f = ol.querySelectorAll("input")[focusIdx]; if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {} } }
		changed();
	}
	function changed() {
		var o = opts();
		$("pl-ocount").textContent = o.length + " of 20";
		var mx = $("pl-max"), want = Math.max(2, o.length), cur = D.m;
		if (mx.options.length !== want - 1) { mx.textContent = ""; for (var i = 2; i <= want; i++) { var op = el("option", null, i === want ? i + " (all)" : String(i)); op.value = i; mx.appendChild(op); } }
		D.m = Math.min(Math.max(2, cur), want); mx.value = D.m;
		$("pl-maxwrap").hidden = D.kind !== "many";
		$("pl-afterrow").hidden = D.end !== "after"; $("pl-atrow").hidden = D.end !== "at";
		var cl = closeMs(), en = $("pl-endnote");
		if (D.end === "manual") en.textContent = "Close it from My polls when you are done (it closes by itself after a year).";
		else if (isNaN(cl)) en.textContent = D.end === "at" ? "Pick a date (and a time)." : "Type how long.";
		else en.textContent = "Voting ends " + fmtDate(cl) + " (in " + P.left(cl - Date.now()) + ").";
		$("pl-err").hidden = true;
		saveDraft();
		var p = draftPoll();
		if (pv === "res") { p.n = demoCounts(Math.max(2, p.o.length)); p.v = p.n.reduce(function (a, b) { return a + b; }, 0); if (!p.o.length) p.o = ["Option 1", "Option 2"]; }
		drawPoll($("pl-prev"), p, { mode: pv, preview: true });
		if (pv === "res") $("pl-prev").appendChild(el("p", "tu-note pl-demo", "Made-up numbers, to show what the results look like."));
	}
	function setRadios(name, val) { Array.prototype.forEach.call(root.querySelectorAll('input[name="' + name + '"]'), function (r) { r.checked = r.value === val; }); }
	function fillForm() {
		$("pl-mq").value = D.q; $("pl-md").value = D.d; if (D.d) $("pl-mddet").open = true;
		setRadios("pl-kind", D.kind); setRadios("pl-end", D.end); setRadios("pl-sh", D.sh); $("pl-ch").checked = D.ch;
		$("pl-dur").value = D.dur; $("pl-unit").value = D.unit; setVal("pl-date", D.date); setVal("pl-time", D.time);
		renderOptions();
	}
	function setVal(id, v) { var e = $(id); e.value = v; }
	function create() {
		var p = draftPoll(), cl = closeMs(), probs = P.problems({ q: p.q, d: p.d, o: p.o, cl: cl || 0 });
		if (D.end !== "manual" && isNaN(cl)) probs.unshift(D.end === "at" ? "Pick the date when voting ends." : "Type how long the poll stays open.");
		var err = $("pl-err");
		if (probs.length) { err.textContent = probs[0]; err.hidden = false; return; }
		var go = $("pl-go"); go.disabled = true; go.textContent = "Creating…";
		api("POST", { act: "new", q: p.q, d: p.d, o: p.o, m: p.m, cl: cl ? Math.round(cl) : 0, sh: p.sh, ch: p.ch }).then(function (j) {
			go.disabled = false; go.textContent = "Create the poll";
			if (j._code !== 200 || !j.id) { err.textContent = j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) + "." : "Could not create the poll, try again."; err.hidden = false; return; }
			S.mine.unshift({ id: j.id, key: j.key, q: p.q, c: Date.now() }); save(); renderMine();
			showDone(j.id, j.key, p.q);
		});
	}
	function showDone(id, key, q) {
		var d = $("pl-done"); d.hidden = false;
		$("pl-dlink").value = shareUrl(id);
		$("pl-dopen").href = (MOCK ? "/polls?p=" : "/v/") + id;
		d.dataset.id = id; d.dataset.key = key; d.dataset.q = q;
		$("pl-dqrbox").hidden = true;
		d.scrollIntoView({ behavior: "smooth", block: "center" });
		$("pl-dcopy").focus();
	}
	function wireMaker() {
		$("pl-mq").addEventListener("input", function () { D.q = this.value; changed(); });
		$("pl-md").addEventListener("input", function () { D.d = this.value; changed(); });
		$("pl-oadd").addEventListener("click", function () { if (D.o.length < 20) { if (D.o[D.o.length - 1].trim()) D.o.push(""); renderOptions(D.o.length - 1); } });
		$("pl-opaste").addEventListener("click", function () { $("pl-pastebox").hidden = !$("pl-pastebox").hidden; if (!$("pl-pastebox").hidden) $("pl-ptext").focus(); });
		$("pl-pcancel").addEventListener("click", function () { $("pl-pastebox").hidden = true; });
		$("pl-puse").addEventListener("click", function () { var o = P.optionsFromText($("pl-ptext").value); if (o.length < 1) { toast("Nothing to use"); return; } var cur = opts(); D.o = cur.concat(o).slice(0, 20); if (D.o.length < 2) D.o.push(""); $("pl-ptext").value = ""; $("pl-pastebox").hidden = true; renderOptions(); toast(o.length + (o.length === 1 ? " option" : " options") + " added"); });
		root.addEventListener("change", function (e) {
			var t = e.target;
			if (t.name === "pl-kind") D.kind = t.value; else if (t.name === "pl-end") { D.end = t.value; if (D.end === "at" && !D.date) { var d = new Date(Date.now() + 864e5); D.date = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); D.time = "18:00"; setVal("pl-date", D.date); setVal("pl-time", D.time); } }
			else if (t.name === "pl-sh") D.sh = t.value; else if (t.id === "pl-ch") D.ch = t.checked;
			else if (t.id === "pl-max") D.m = +t.value; else if (t.id === "pl-unit") D.unit = t.value;
			else if (t.id === "pl-date") D.date = t.value; else if (t.id === "pl-time") D.time = t.value;
			else return;
			changed();
		});
		["pl-date", "pl-time"].forEach(function (id) { $(id).addEventListener("input", function () { D[id.slice(3)] = this.value; changed(); }); });
		$("pl-dur").addEventListener("input", function () { D.dur = Math.max(0, +this.value || 0); changed(); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-dur]"), function (b) { b.addEventListener("click", function () { var p = b.getAttribute("data-dur").split(","); D.dur = +p[0]; D.unit = p[1]; $("pl-dur").value = D.dur; $("pl-unit").value = D.unit; changed(); }); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-pv]"), function (b) { b.addEventListener("click", function () { pv = b.getAttribute("data-pv"); Array.prototype.forEach.call(root.querySelectorAll("[data-pv]"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); changed(); }); });
		$("pl-go").addEventListener("click", create);
		$("pl-reset").addEventListener("click", function () { if ((D.q || opts().length) && !confirm("Clear the question and options?")) return; D.q = ""; D.d = ""; D.o = ["", ""]; fillForm(); $("pl-mq").focus(); });
		$("pl-mq").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var f = $("pl-olist").querySelector("input"); if (f) f.focus(); } });
		$("pl-zone").textContent = "In your time zone (" + (Intl.DateTimeFormat().resolvedOptions().timeZone || "local time") + "). Everyone sees the closing time in their own time zone.";
		// done card
		$("pl-dcopy").addEventListener("click", function () { copy($("pl-dlink").value, "Link copied"); });
		$("pl-dtext").addEventListener("click", function () { var d = $("pl-done"); copy(d.dataset.q + "\nVote here: " + $("pl-dlink").value, "Text copied"); });
		$("pl-dqr").addEventListener("click", function () { qr($("pl-dqrbox"), $("pl-dlink").value); });
		$("pl-dmgr").addEventListener("click", function () { var d = $("pl-done"); copy(location.origin + "/polls?p=" + d.dataset.id + "#k=" + d.dataset.key, "Manager link copied: keep it private"); });
		$("pl-dnew").addEventListener("click", function () { $("pl-done").hidden = true; D.q = ""; D.d = ""; D.o = ["", ""]; fillForm(); $("pl-mq").focus(); });
		$("pl-dlink").addEventListener("focus", function () { this.select(); });
		// open a poll by link
		function go() { var id = P.idFromText($("pl-goid").value); if (!id) { toast("That is not a poll link"); return; } location.href = (MOCK ? "/polls?p=" : "/v/") + id; }
		$("pl-goopen").addEventListener("click", go);
		$("pl-goid").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
		function when() { if (window.MESWhen && !root.querySelector(".mes-when")) MESWhen.attach({ anchor: $("pl-atrow").querySelector(".tu-row"), date: "pl-date", time: "pl-time", label: "Or type it in words", placeholder: "next Friday 6 pm, Nov 30 noon" }); }
		if (window.MESWhen) when(); else document.addEventListener("DOMContentLoaded", when);
	}

	/* ---------- start ---------- */
	wireView(); wireMaker(); fillForm(); renderMine(); loadStatuses();
	var m = location.pathname.match(/^\/v\/([a-z0-9]{8})\/?$/), q = new URLSearchParams(location.search);
	var id = m ? m[1] : P.idFromText("?p=" + (q.get("p") || ""));
	var hk = location.hash.match(/(?:^#|&)k=([a-f0-9]{32})/);
	if (id && hk && !mineOf(id)) { S.mine.unshift({ id: id, key: hk[1], q: "", c: Date.now() }); save(); }
	if (hk) history.replaceState(null, "", location.pathname + location.search);
	if (id) openPoll(id).then(function () { var mm = mineOf(id); if (mm && V.poll && !mm.q) { mm.q = V.poll.q; save(); renderMine(); } });
	if (MOCK) root.insertAdjacentHTML("afterbegin", '<p class="tu-note pl-mocknote">Test mode: this copy of the page saves polls in this browser only (no server here).</p>');
})();
