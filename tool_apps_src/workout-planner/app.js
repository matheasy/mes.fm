/* MES Workout Planner -- mes.fm/workout-planner (UI; logic in lib.js = MESWP).
 * Plan + history in localStorage "mes-workout-planner:v1"; view settings in "mes-workout-planner:ui".
 * Drag and drop = pointer events (mouse: after 4 px; touch: press and hold 300 ms on an activity, at once on a ⠿ grip),
 * drop targets carry data-drop="c|<day>|<cat>" (a week cell) or "g|<list>|<group>" (a list group); Alt while dropping copies.
 * Share links: ?p=<MESWP.encodeShare> (no history). Fill window / Full screen: /main_js/panel-view.js (MESPanel).
 */
(function () {
	"use strict";
	var W = window.MESWP, root = document.getElementById("wp");
	if (!W || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-workout-planner:v1", UKEY = "mes-workout-planner:ui";
	var H24 = (function () { try { return !new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12; } catch (e) { return false; } })();
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function today() { return W.dateKey(new Date()); }
	function toast(msg, undo) {
		var t = $("wp-toast");
		if (!t) { t = document.createElement("div"); t.id = "wp-toast"; t.className = "tu-toast wp-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
		t.innerHTML = esc(msg) + (undo ? ' <button type="button" class="wp-toastundo">Undo</button>' : "");
		t.classList.add("tu-toast--show");
		var b = t.querySelector(".wp-toastundo"); if (b) b.onclick = function () { doUndo(); t.classList.remove("tu-toast--show"); };
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, undo ? 6000 : 2600);
	}

	/* ---------- state, saving, undo ---------- */
	var P, U = { orient: "rows", lay: "auto", skip: true, weeks: 26, ws: 0 }, UNDO = [];
	function load() {
		try { var s = localStorage.getItem(KEY); if (s) P = W.normalize(JSON.parse(s)); } catch (e) {}
		if (!P) P = W.template("mes");
		try { var u = JSON.parse(localStorage.getItem(UKEY) || "null"); if (u) { if (/^(rows|cols)$/.test(u.orient)) U.orient = u.orient; if (/^(auto|table|cards)$/.test(u.lay)) U.lay = u.lay; if (typeof u.skip === "boolean") U.skip = u.skip; if ([13, 26, 52].indexOf(u.weeks) >= 0) U.weeks = u.weeks; if (u.ws === 1) U.ws = 1; } } catch (e) {}
	}
	var hadData = false; try { hadData = !!localStorage.getItem(KEY); } catch (e) {}
	load();
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(P)); $("wp-saved").textContent = "Saved in this browser"; } catch (e) { $("wp-saved").textContent = "Could not save (storage full or blocked)"; }
	}
	function saveUI() { try { localStorage.setItem(UKEY, JSON.stringify(U)); } catch (e) {} }
	function snap() { UNDO.push(JSON.stringify(P)); if (UNDO.length > 60) UNDO.shift(); $("wp-undo").disabled = false; }
	function change(fn, keepFocus) { snap(); fn(); save(); render(keepFocus); }
	function doUndo() {
		if (!UNDO.length) return;
		P = W.normalize(JSON.parse(UNDO.pop())); save(); render(); $("wp-undo").disabled = !UNDO.length; toast("Undone");
	}
	window.addEventListener("storage", function (e) { if (e.key === KEY && e.newValue) { try { P = W.normalize(JSON.parse(e.newValue)); render(); } catch (x) {} } });

	/* ---------- shared bits ---------- */
	function catColor(id) { var c = W.catById(P, id); return c ? c.color : "#8a94a3"; }
	function chip(it, opt) {
		opt = opt || {};
		var m = W.meta(it), cls = "wp-chip" + (opt.row ? " wp-chip--row" : "") + (opt.here ? " is-here" : "") + (it.done && opt.row ? " is-done" : "");
		var lab = it.name + (m ? ", " + m : "") + (it.note ? ", " + it.note : "");
		var h = '<div class="' + cls + '" data-item="' + it.id + '" tabindex="0" role="button" aria-label="' + esc(lab) + '" style="--c:' + catColor(it.cat) + '">';
		if (opt.check) h += '<input type="checkbox" class="wp-done" data-done="' + it.id + '"' + (it.done ? " checked" : "") + ' aria-label="Done: ' + esc(it.name) + '">';
		h += '<span class="wp-cn">' + esc(it.name) + '</span>';
		if (m) h += '<span class="wp-cm">' + esc(m) + '</span>';
		if (it.note) h += '<span class="wp-cnote" title="' + esc(it.note) + '">✎</span>';
		if (opt.row && it.done) h += '<span class="wp-stamp">Done ' + esc(W.shortDate(it.done, today())) + '</span>';
		if (opt.rot) h += opt.here ? '<span class="wp-herepill">📍 Here</span>' : '<button type="button" class="wp-sethere" data-gh="' + it.id + '" aria-label="Mark ' + esc(it.name) + ' as Here">Set here</button>';
		return h + "</div>";
	}
	function cell(d, c) {
		return '<div class="wp-cell" data-drop="c|' + d.id + "|" + c.id + '" data-axis="x" style="--c:' + c.color + '">' + W.cellItems(d, c.id).map(function (x) { return chip(x); }).join("") +
			'<button type="button" class="wp-add" data-add="c|' + d.id + "|" + c.id + '" aria-label="Add ' + esc(c.name) + " on " + W.DOW[d.dow] + '">+</button></div>';
	}
	function timeBox(d) { return '<input type="text" class="wp-time" data-time="' + d.id + '" value="' + esc(W.fmtTime(d.time, H24)) + '" placeholder="time" aria-label="Time on ' + W.DOW[d.dow] + '" autocomplete="off" maxlength="9">'; }
	function hereBtn(d) {
		var on = d.id === P.here;
		return '<button type="button" class="wp-here' + (on ? " is-on" : "") + '" data-here="' + d.id + '" aria-pressed="' + on + '" title="' + (on ? "You are here in the rotation" : "Move the Currently at marker here") + '">' + (on ? "📍 Here" : "Set here") + "</button>";
	}
	function dayLabel(d, td) { return '<span class="wp-dname">' + W.DOW[d.dow] + "</span>" + (d.dow === td ? '<span class="wp-today">Today</span>' : ""); }
	function grip(d) { return '<button type="button" class="wp-grip" data-grip="' + d.id + '" aria-label="Move ' + W.DOW[d.dow] + ' (arrow keys or drag)" title="Drag to reorder">⠿</button>'; }

	/* ---------- the week ---------- */
	var mq = window.matchMedia ? window.matchMedia("(max-width: 700px)") : { matches: false };
	function layout() { return U.lay === "auto" ? (mq.matches ? "cards" : "table") : U.lay; }
	function renderWeek() {
		var td = W.dowOf(today()), lay = layout(), h = "";
		if (lay === "cards") {
			h = '<div class="wp-cards">' + P.days.map(function (d) {
				return '<div class="wp-dcard' + (d.id === P.here ? " is-here" : "") + (d.dow === td ? " is-today" : "") + '" data-row="' + d.id + '"><div class="wp-dhead">' + grip(d) + dayLabel(d, td) + timeBox(d) + hereBtn(d) + "</div>" +
					P.cats.map(function (c) { return '<div class="wp-crow"><span class="wp-clab" style="--c:' + c.color + '">' + esc(c.name) + "</span>" + cell(d, c) + "</div>"; }).join("") + "</div>";
			}).join("") + "</div>";
		} else if (U.orient === "cols") {
			h = '<div class="wp-tablewrap"><table class="wp-table wp-table--cols"><thead><tr><th scope="col"><span class="wp-sr">Row</span></th>' + P.days.map(function (d) {
				return '<th scope="col" data-row="' + d.id + '" class="' + (d.id === P.here ? "is-here " : "") + (d.dow === td ? "is-today" : "") + '"><div class="wp-colhead">' + grip(d) + dayLabel(d, td) + "</div></th>";
			}).join("") + "</tr></thead><tbody>" +
				'<tr><th scope="row">Time</th>' + P.days.map(function (d) { return '<td class="' + (d.id === P.here ? "is-here" : "") + '">' + timeBox(d) + "</td>"; }).join("") + "</tr>" +
				P.cats.map(function (c) { return '<tr><th scope="row"><span class="wp-clab" style="--c:' + c.color + '">' + esc(c.name) + "</span></th>" + P.days.map(function (d) { return '<td class="' + (d.id === P.here ? "is-here" : "") + '">' + cell(d, c) + "</td>"; }).join("") + "</tr>"; }).join("") +
				'<tr><th scope="row">Currently at</th>' + P.days.map(function (d) { return '<td class="' + (d.id === P.here ? "is-here" : "") + '">' + hereBtn(d) + "</td>"; }).join("") + "</tr></tbody></table></div>";
		} else {
			h = '<div class="wp-tablewrap"><table class="wp-table"><thead><tr><th class="wp-gcol"><span class="wp-sr">Move</span></th><th scope="col">Day</th><th scope="col">Time</th>' +
				P.cats.map(function (c) { return '<th scope="col"><span class="wp-clab" style="--c:' + c.color + '">' + esc(c.name) + "</span></th>"; }).join("") + '<th scope="col" class="wp-hcol">Currently at</th></tr></thead><tbody>' +
				P.days.map(function (d) {
					return '<tr data-row="' + d.id + '" class="' + (d.id === P.here ? "is-here " : "") + (d.dow === td ? "is-today" : "") + '"><td class="wp-gcol">' + grip(d) + '</td><th scope="row">' + dayLabel(d, td) + "</th><td>" + timeBox(d) + "</td>" +
						P.cats.map(function (c) { return "<td>" + cell(d, c) + "</td>"; }).join("") + '<td class="wp-hcol">' + hereBtn(d) + "</td></tr>";
				}).join("") + "</tbody></table></div>";
		}
		$("wp-week").innerHTML = h;
		$("wp-week").setAttribute("data-lay", lay === "cards" ? "cards" : U.orient);
	}
	function renderCats() {
		$("wp-cats").innerHTML = '<span class="wp-catlab">Categories</span>' + P.cats.map(function (c) {
			return '<span class="wp-cat" style="--c:' + c.color + '"><input type="color" value="' + c.color + '" data-ccol="' + c.id + '" aria-label="Colour of ' + esc(c.name) + '"><input type="text" class="wp-cname" value="' + esc(c.name) + '" data-cname="' + c.id + '" maxlength="40" aria-label="Category name" size="' + Math.max(4, Math.min(16, c.name.length + 1)) + '">' +
				(P.cats.length > 1 ? '<button type="button" class="wp-x" data-cdel="' + c.id + '" aria-label="Delete category ' + esc(c.name) + '">✕</button>' : "") + "</span>";
		}).join("") + (P.cats.length < W.LIM.cats ? '<button type="button" class="tu-chip" id="wp-addcat">+ Category</button>' : "");
	}

	/* ---------- "Currently at" card ---------- */
	var nextDate = "";
	function renderNext() {
		var d = W.dayById(P, P.here), td = today(), trow = W.todayRow(P, td), nx = W.nextDay(P, U.skip);
		var h = '<div class="wp-nexthead"><span class="wp-pin">📍 Currently at</span> <b class="wp-nday">' + W.DOW[d.dow] + "</b>" + (d.time ? ' <span class="wp-ntime">' + esc(W.fmtTime(d.time, H24)) + "</span>" : "") +
			'<span class="wp-nnav"><button type="button" class="tu-btn tu-btn--ghost" id="wp-nprev" aria-label="Move the marker back one day">←</button><button type="button" class="tu-btn tu-btn--ghost" id="wp-nskip">Skip →</button></span></div>';
		if (d.items.length) {
			h += '<ul class="wp-nlist">' + d.items.map(function (x) {
				var m = W.meta(x), c = W.catById(P, x.cat);
				return '<li style="--c:' + catColor(x.cat) + '"><label><input type="checkbox" checked data-nchk="' + x.id + '"> <span class="wp-ndot"></span><b>' + esc(x.name) + "</b>" + (m ? ' <span class="wp-cm">' + esc(m) + "</span>" : "") + (c ? ' <span class="wp-ncat">' + esc(c.name) + "</span>" : "") + (x.note ? ' <span class="wp-nnote">' + esc(x.note) + "</span>" : "") + "</label></li>";
			}).join("") + "</ul>";
		} else h += '<p class="wp-rest">Nothing planned: a rest day.</p>';
		h += '<div class="wp-nact"><button type="button" class="tu-btn tu-btn--primary wp-big" id="wp-ndone">✓ Done, move to ' + W.DOW[nx.dow] + '</button><label class="wp-ndate">on <input type="date" id="wp-ndate" class="tu-input" value="' + (nextDate || td) + '" max="' + td + '"></label></div>';
		if (P.note) h += '<p class="wp-pnote">' + esc(P.note) + "</p>";
		var after = '<p class="tu-note wp-after">Then: <b>' + W.DOW[nx.dow] + "</b>" + (nx.items.length ? " · " + esc(nx.items.map(function (x) { return x.name; }).join(", ")) : " · rest") + ".";
		if (trow && trow.id !== d.id) after += ' Today is ' + W.DOW[trow.dow] + (trow.items.length ? " (" + esc(trow.items.map(function (x) { return x.name; }).join(", ")) + ")" : "") + '. <button type="button" class="wp-link" id="wp-ntoday">Move the marker to today</button>';
		h += after + "</p>";
		var rot = [];
		P.lists.forEach(function (l) { l.groups.forEach(function (g) {
			if (g.mode === "one" && g.here) { var f = W.findItem(P, g.here); if (f) rot.push('<li><span class="wp-lname2">' + esc(l.name) + (g.title ? " › " + esc(g.title) : "") + ':</span> <b>' + esc(f.item.name) + '</b> <button type="button" class="tu-btn wp-sm" data-gdone="' + l.id + "|" + g.id + '">✓ Done, next</button></li>'); }
			else if (g.mode === "all") { var left = g.items.filter(function (x) { return !x.done; }); if (left.length) rot.push('<li><span class="wp-lname2">' + esc(l.name) + (g.title ? " › " + esc(g.title) : "") + ':</span> ' + left.length + " left (next: <b>" + esc(left[0].name) + "</b>)</li>"); }
		}); });
		if (rot.length) h += '<div class="wp-nrot"><b>From your lists</b><ul>' + rot.join("") + "</ul></div>";
		$("wp-next").innerHTML = h;
	}

	/* ---------- training lists ---------- */
	function renderLists() {
		if (!P.lists.length) { $("wp-lists").innerHTML = '<p class="wp-empty">No lists yet. A list is good for skills you rotate through, like drills or practice targets.</p>'; return; }
		$("wp-lists").innerHTML = P.lists.map(function (l, li) {
			return '<div class="wp-list" data-list="' + l.id + '"><div class="wp-lhead"><input type="text" class="wp-lname" data-lname="' + l.id + '" value="' + esc(l.name) + '" maxlength="80" aria-label="List name">' +
				'<span class="wp-lbtns"><button type="button" class="wp-ib" data-lmove="' + l.id + '|-1"' + (li ? "" : " disabled") + ' aria-label="Move list up">↑</button><button type="button" class="wp-ib" data-lmove="' + l.id + '|1"' + (li < P.lists.length - 1 ? "" : " disabled") + ' aria-label="Move list down">↓</button><button type="button" class="wp-ib wp-danger" data-ldel="' + l.id + '" aria-label="Delete list">🗑</button></span></div>' +
				l.groups.map(function (g, gi) {
					var one = g.mode === "one";
					return '<div class="wp-grp' + (one ? " wp-grp--one" : "") + '"><div class="wp-ghead"><input type="text" class="wp-gtitle" data-gtitle="' + l.id + "|" + g.id + '" value="' + esc(g.title) + '" maxlength="80" placeholder="' + (one ? "Do one after finishing above" : "Group name, e.g. Monday Workouts") + '" aria-label="Group name">' +
						'<select class="wp-gmode" data-gmode="' + l.id + "|" + g.id + '" aria-label="How this group works"><option value="all"' + (one ? "" : " selected") + '>Do all (checklist)</option><option value="one"' + (one ? " selected" : "") + '>Do one, in turn</option></select>' +
						'<span class="wp-lbtns"><button type="button" class="wp-ib" data-gmove="' + l.id + "|" + g.id + '|-1"' + (gi ? "" : " disabled") + ' aria-label="Move group up">↑</button><button type="button" class="wp-ib" data-gmove="' + l.id + "|" + g.id + '|1"' + (gi < l.groups.length - 1 ? "" : " disabled") + ' aria-label="Move group down">↓</button>' +
						(one ? "" : '<button type="button" class="wp-ib" data-greset="' + l.id + "|" + g.id + '" title="Clear every done date" aria-label="Start this checklist again">↺</button>') +
						(l.groups.length > 1 ? '<button type="button" class="wp-ib wp-danger" data-gdel="' + l.id + "|" + g.id + '" aria-label="Delete group">🗑</button>' : "") + "</span></div>" +
						'<div class="wp-gitems" data-drop="g|' + l.id + "|" + g.id + '" data-axis="y">' + g.items.map(function (x) { return chip(x, { row: true, check: !one, rot: one, here: one && g.here === x.id }); }).join("") +
						'<button type="button" class="wp-add wp-add--row" data-add="g|' + l.id + "|" + g.id + '">+ Add</button></div>' +
						(one && g.here ? '<div class="wp-gfoot"><button type="button" class="tu-btn tu-btn--primary wp-sm" data-gdone="' + l.id + "|" + g.id + '">✓ Done, next one</button></div>' : "") + "</div>";
				}).join("") +
				'<div class="wp-lfoot"><button type="button" class="tu-chip" data-gadd="' + l.id + '">+ Group</button></div>' +
				'<textarea class="wp-lnote" data-lnote="' + l.id + '" rows="1" maxlength="600" placeholder="Note, e.g. Juggle: do at the end or the beginning when practical" aria-label="Note for this list">' + esc(l.note) + "</textarea></div>";
		}).join("");
	}

	/* ---------- history ---------- */
	var selDay = "";
	function renderHist() {
		var td = today(), st = W.streaks(P.log, td), wk = W.weekSummary(P, td, U.ws), wst = W.weekStreak(P.log, td, 1, U.ws);
		function tile(lab, val, sub, hero) { return '<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + lab + '</div><div class="tu-stat__value">' + val + '</div><div class="tu-stat__sub">' + sub + "</div></div>"; }
		$("wp-stats").innerHTML = tile("Current streak", st.current + (st.current === 1 ? " day" : " days"), "Days in a row with something logged", true) +
			tile("Best streak", st.best + (st.best === 1 ? " day" : " days"), st.activeDays + (st.activeDays === 1 ? " active day" : " active days") + " in all") +
			tile("Weeks in a row", wst, "Weeks with at least one workout") +
			tile("This week", wk.activeDays + " of " + wk.plannedDays, "Active days vs. days planned");
		var maxv = 1; wk.rows.forEach(function (r) { maxv = Math.max(maxv, r.planned, r.done); });
		var mins = wk.rows.reduce(function (s, r) { return s + r.minutes; }, 0) + wk.otherMin;
		$("wp-sum").innerHTML = '<p class="tu-note">' + esc(W.shortDate(wk.start, td)) + " to " + esc(W.shortDate(wk.end, td)) + (mins ? " · " + mins + " minutes logged" : "") + "</p>" +
			wk.rows.map(function (r) {
				return '<div class="wp-sumrow" style="--c:' + r.color + '"><span class="wp-sumlab">' + esc(r.name) + '</span><span class="wp-sumbar" role="img" aria-label="' + r.done + " done of " + r.planned + ' planned"><i class="wp-sumplan" style="width:' + (r.planned / maxv * 100) + '%"></i><i class="wp-sumdone" style="width:' + (Math.min(r.done, maxv) / maxv * 100) + '%"></i></span><span class="wp-sumnum">' + r.done + " / " + r.planned + (r.minutes ? " · " + r.minutes + " min" : "") + "</span></div>";
			}).join("") + (wk.other ? '<p class="tu-note">Plus ' + wk.other + " from your lists.</p>" : "");
		var cells = W.heat(P.log, td, U.weeks, U.ws), cols = cells.length / 7, h = '<div class="wp-hmonths" style="grid-template-columns:repeat(' + cols + ',1fr)">';
		for (var c = 0; c < cols; c++) { var first = cells[c * 7].d, prevM = c ? cells[(c - 1) * 7].d.slice(5, 7) : ""; h += "<span>" + (first.slice(5, 7) !== prevM ? W.MONTHS[+first.slice(5, 7) - 1] : "") + "</span>"; }
		h += '</div><div class="wp-hgrid" style="grid-template-columns:repeat(' + cols + ',1fr)">';
		for (var r = 0; r < 7; r++) for (c = 0; c < cols; c++) {
			var x = cells[c * 7 + r], lv = x.n ? Math.min(4, x.n) : 0;
			h += '<button type="button" class="wp-hc wp-l' + lv + (x.future ? " is-future" : "") + (x.d === td ? " is-td" : "") + (x.d === selDay ? " is-sel" : "") + '" style="grid-row:' + (r + 1) + ";grid-column:" + (c + 1) + '" data-hd="' + x.d + '" title="' + x.d + ": " + x.n + ' logged" aria-label="' + W.DOW[W.dowOf(x.d)] + " " + W.shortDate(x.d, td) + ", " + x.n + ' logged"' + (x.future ? " disabled" : "") + "></button>";
		}
		$("wp-heat").innerHTML = h + "</div>";
		renderDay();
	}
	function renderDay() {
		var td = today(), by = W.byDate(P.log), h = "";
		if (selDay) {
			var es = by[selDay] || [];
			h = '<div class="wp-dd"><b>' + W.DOW[W.dowOf(selDay)] + " " + esc(W.shortDate(selDay, td)) + "</b>: " + (es.length ? "" : "nothing logged. ") +
				'<button type="button" class="wp-link" id="wp-logthere">Log the Currently-at workout on this day</button> <button type="button" class="wp-link" id="wp-ddclose">Close</button>' + logList(es) + "</div>";
		}
		var recent = P.log.slice(-12).reverse();
		h += '<h3>Recent</h3>' + (recent.length ? logList(recent, true) : '<p class="wp-empty">Nothing logged yet. Press <b>Done</b> above when you finish a workout.</p>');
		$("wp-daydet").innerHTML = h;
	}
	function logList(es, withDate) {
		return '<ul class="wp-log">' + es.map(function (e) {
			var i = P.log.indexOf(e), c = W.catById(P, e.c), l = e.k !== "w" ? W.listById(P, e.k) : null;
			return '<li style="--c:' + (c ? c.color : "#8a94a3") + '"><span class="wp-ndot"></span>' + (withDate ? '<span class="wp-ld">' + esc(W.shortDate(e.d, today())) + "</span> " : "") + "<b>" + esc(e.n) + "</b>" + (c ? ' <span class="wp-ncat">' + esc(c.name) + "</span>" : l ? ' <span class="wp-ncat">' + esc(l.name) + "</span>" : "") + (e.m ? " · " + e.m + " min" : "") +
				' <button type="button" class="wp-x" data-ldel2="' + i + '" aria-label="Remove this entry">✕</button></li>';
		}).join("") + "</ul>";
	}

	/* ---------- render all ---------- */
	function render(focusId) {
		var ae = document.activeElement, keep = focusId || (ae && ae.getAttribute && (ae.getAttribute("data-item") ? "i:" + ae.getAttribute("data-item") : ae.getAttribute("data-grip") ? "g:" + ae.getAttribute("data-grip") : ""));
		if (document.activeElement !== $("wp-title")) $("wp-title").value = P.title;
		if (document.activeElement !== $("wp-note")) { $("wp-note").value = P.note; grow($("wp-note")); }
		renderCats(); renderWeek(); renderNext(); renderLists(); renderHist();
		Array.prototype.forEach.call(root.querySelectorAll(".wp-lnote"), grow);
		segs();
		if (keep && typeof keep === "string") {
			var el = keep.slice(0, 2) === "i:" ? root.querySelector('[data-item="' + keep.slice(2) + '"]') : keep.slice(0, 2) === "g:" ? root.querySelector('[data-grip="' + keep.slice(2) + '"]') : null;
			if (el) try { el.focus({ preventScroll: false }); } catch (e) {}
		}
		if (EDIT) { var f = W.findItem(P, EDIT); if (f) fillEditor(); else closeEditor(); }
	}
	function segs() {
		[["wp-orient", "o", U.orient], ["wp-lay", "l", U.lay], ["wp-weeks", "w", String(U.weeks)]].forEach(function (s) {
			Array.prototype.forEach.call($(s[0]).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-" + s[1]) === s[2] ? "true" : "false"); });
		});
		$("wp-orient").style.display = layout() === "cards" ? "none" : "";
		$("wp-skip").checked = U.skip; $("wp-ws").value = String(U.ws);
	}
	function grow(t) { if (!t) return; t.style.height = "auto"; t.style.height = Math.min(240, t.scrollHeight + 2) + "px"; }

	/* ---------- editor popover ---------- */
	var EDIT = "", EDANCHOR = null;
	function destOptions(cur) {
		var o = '<option value="">Choose a place…</option><optgroup label="Week">';
		P.days.forEach(function (d) { P.cats.forEach(function (c) { var v = "c|" + d.id + "|" + c.id; o += '<option value="' + v + '"' + (v === cur ? " disabled" : "") + ">" + W.DOW[d.dow] + " · " + esc(c.name) + "</option>"; }); });
		o += "</optgroup>";
		P.lists.forEach(function (l) { o += '<optgroup label="' + esc(l.name) + '">' + l.groups.map(function (g, i) { var v = "g|" + l.id + "|" + g.id; return '<option value="' + v + '"' + (v === cur ? " disabled" : "") + ">" + esc(g.title || (g.mode === "one" ? "Rotation" : "Group " + (i + 1))) + "</option>"; }).join("") + "</optgroup>"; });
		return o;
	}
	function fillEditor() {
		var f = W.findItem(P, EDIT); if (!f) return;
		var it = f.item, inWeek = f.where.kind === "c";
		[["wp-ename", it.name], ["wp-esets", it.sets || ""], ["wp-ereps", it.reps], ["wp-edur", it.dur || ""], ["wp-enote", it.note], ["wp-edone", it.done]].forEach(function (x) { if (document.activeElement !== $(x[0])) $(x[0]).value = x[1]; });
		$("wp-ecat").innerHTML = (inWeek ? "" : '<option value="">None</option>') + P.cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === it.cat ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("");
		$("wp-ecat").value = it.cat || "";
		$("wp-edonel").hidden = inWeek;
		var cur = inWeek ? "c|" + f.where.day + "|" + it.cat : "g|" + f.where.list + "|" + f.where.grp;
		$("wp-emove").innerHTML = destOptions(cur);
		$("wp-edh").textContent = inWeek ? W.DOW[W.dayById(P, f.where.day).dow] + " · " + ((W.catById(P, it.cat) || {}).name || "") : (W.listById(P, f.where.list) || {}).name || "Activity";
	}
	function openEditor(id, anchor, focusName) {
		EDIT = id; EDANCHOR = anchor; var ed = $("wp-ed");
		fillEditor(); ed.hidden = false; placeEditor();
		if (focusName !== false) setTimeout(function () { try { $("wp-ename").focus(); $("wp-ename").select(); } catch (e) {} }, 0);
	}
	function placeEditor() {
		var ed = $("wp-ed"); if (ed.hidden) return;
		var fill = document.querySelector(".mes-pfill"); if (fill && ed.parentNode !== fill) fill.appendChild(ed); else if (!fill && ed.parentNode !== root) root.appendChild(ed);
		if (window.innerWidth <= 600) { ed.classList.add("wp-ed--sheet"); ed.style.left = ed.style.top = ""; return; }
		ed.classList.remove("wp-ed--sheet");
		var a = EDANCHOR && document.body.contains(EDANCHOR) ? EDANCHOR : root.querySelector('[data-item="' + EDIT + '"]');
		var r = a ? a.getBoundingClientRect() : { left: 40, bottom: 80, top: 60 }, w = ed.offsetWidth, h = ed.offsetHeight;
		var x = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), y = r.bottom + 6;
		if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
		ed.style.left = x + "px"; ed.style.top = y + "px";
	}
	function closeEditor(refocus) {
		var id = EDIT; EDIT = ""; $("wp-ed").hidden = true;
		if (refocus && id) { var el = root.querySelector('[data-item="' + id + '"]'); if (el) el.focus(); }
	}
	function editField(fn) { var f = W.findItem(P, EDIT); if (!f) return; snapOnce(); fn(f.item, f); save(); render(); }
	var snapT = 0; function snapOnce() { var now = Date.now(); if (now - snapT > 1500) snap(); snapT = now; }   // typing in the editor = one undo step
	$("wp-ename").addEventListener("input", function () { var v = W.str(this.value); editField(function (it) { it.name = v || "Activity"; }); });
	$("wp-esets").addEventListener("input", function () { var v = parseInt(this.value, 10); editField(function (it) { it.sets = v > 0 && v < 100 ? v : 0; }); });
	$("wp-ereps").addEventListener("input", function () { var v = W.str(this.value, 20); editField(function (it) { it.reps = v; }); });
	$("wp-edur").addEventListener("input", function () { var v = parseFloat(this.value); editField(function (it) { it.dur = v > 0 ? Math.min(1440, Math.round(v * 10) / 10) : 0; }); });
	$("wp-enote").addEventListener("input", function () { var v = W.str(this.value, 300); editField(function (it) { it.note = v; }); });
	$("wp-edone").addEventListener("change", function () { var v = W.okDate(this.value); editField(function (it) { it.done = v; }); });
	$("wp-ecat").addEventListener("change", function () {
		var v = this.value, f = W.findItem(P, EDIT); if (!f) return;
		if (f.where.kind === "c") change(function () { W.moveItem(P, EDIT, { kind: "c", day: f.where.day, cat: v }); }); else editField(function (it) { it.cat = v; });
	});
	$("wp-emove").addEventListener("change", function () {
		var v = this.value.split("|"); if (!v[0]) return;
		var id = EDIT; change(function () { W.moveItem(P, id, v[0] === "c" ? { kind: "c", day: v[1], cat: v[2] } : { kind: "g", list: v[1], grp: v[2] }); });
		EDANCHOR = null; toast("Moved"); placeEditor();
	});
	$("wp-elog").addEventListener("click", function () {
		var f = W.findItem(P, EDIT); if (!f) return;
		change(function () { W.logItems(P, [f.item], today(), f.where.kind === "g" ? f.where.list : "w"); if (f.where.kind === "g") f.item.done = today(); });
		toast("Logged " + f.item.name + " for today", true);
	});
	$("wp-edup").addEventListener("click", function () {
		var f = W.findItem(P, EDIT); if (!f) return; var nid;
		change(function () { var dest = f.where.kind === "c" ? { kind: "c", day: f.where.day, cat: f.item.cat } : { kind: "g", list: f.where.list, grp: f.where.grp }; var c = W.moveItem(P, f.item.id, dest, (f.where.kind === "c" ? W.cellItems(W.dayById(P, f.where.day), f.item.cat).indexOf(f.item) : f.idx) + 1, true); nid = c && c.id; });
		if (nid) { var el = root.querySelector('[data-item="' + nid + '"]'); openEditor(nid, el); }
	});
	$("wp-edel").addEventListener("click", function () { var id = EDIT; closeEditor(); delItem(id); });
	$("wp-edx").addEventListener("click", function () { closeEditor(true); });
	function delItem(id) { var f = W.findItem(P, id); if (!f) return; change(function () { W.removeItem(P, id); }); toast("Deleted " + f.item.name, true); }
	document.addEventListener("pointerdown", function (e) { if (!EDIT) return; if ($("wp-ed").contains(e.target) || e.target.closest("[data-item]")) return; closeEditor(); }, true);
	window.addEventListener("resize", function () { placeEditor(); if ($("wp-week").getAttribute("data-lay") !== (layout() === "cards" ? "cards" : U.orient)) render(); });   // only when the layout really changes: a phone keyboard resizes the window too

	/* ---------- inline add ---------- */
	function openAdd(btn) {
		var spec = btn.getAttribute("data-add"), inp = document.createElement("input");
		inp.type = "text"; inp.className = "wp-addin"; inp.maxLength = 120; inp.placeholder = "Type, then Enter"; inp.setAttribute("aria-label", "New activity name"); inp.setAttribute("data-addspec", spec);
		btn.replaceWith(inp); inp.focus();
		var done = false;
		inp.addEventListener("keydown", function (e) {
			if (e.key === "Escape") { done = true; render(); return; }
			if (e.key !== "Enter") return;
			e.preventDefault();
			var o = W.parseItemText(inp.value.trim()); if (!o.name) { done = true; render(); return; }
			done = true; addItem(spec, o, true);
		});
		inp.addEventListener("blur", function () {
			if (done) return; done = true;
			var v = inp.value.trim(); if (v) addItem(spec, W.parseItemText(v), false); else render();
		});
	}
	function addItem(spec, o, again) {
		var s = spec.split("|");
		change(function () {
			var it = W.item(o.name, s[0] === "c" ? s[2] : "", o);
			if (s[0] === "c") { var d = W.dayById(P, s[1]); if (d) d.items.push(it); }
			else { var g = W.grpById(P, s[1], s[2]); if (g) { g.items.push(it); if (g.mode === "one" && !g.here) g.here = it.id; } }
		});
		if (again) { var b = root.querySelector('[data-add="' + spec + '"]'); if (b) openAdd(b); }
	}

	/* ---------- clicks, inputs and keys in the planner ---------- */
	var suppressClick = false;
	root.addEventListener("click", function (e) {
		if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
		var t = e.target, b;
		if ((b = t.closest("[data-add]"))) return openAdd(b);
		if ((b = t.closest("[data-here]"))) { var hid = b.getAttribute("data-here"); if (hid !== P.here) change(function () { P.here = hid; }); return; }
		if ((b = t.closest("[data-gh]"))) { var gf = W.findItem(P, b.getAttribute("data-gh")); if (gf) change(function () { W.grpById(P, gf.where.list, gf.where.grp).here = gf.item.id; }); return; }
		if ((b = t.closest("[data-gdone]"))) return groupDone(b.getAttribute("data-gdone").split("|"));
		if ((b = t.closest("[data-done]"))) return;   // checkbox: handled in "change"
		if ((b = t.closest("[data-cdel]"))) return delCat(b.getAttribute("data-cdel"));
		if (t.id === "wp-addcat") return addCat();
		if ((b = t.closest("[data-ldel]"))) { var L = W.listById(P, b.getAttribute("data-ldel")); if (L) { change(function () { P.lists.splice(P.lists.indexOf(L), 1); }); toast("Deleted the list " + L.name, true); } return; }
		if ((b = t.closest("[data-lmove]"))) { var lm = b.getAttribute("data-lmove").split("|"), li = P.lists.findIndex(function (x) { return x.id === lm[0]; }); change(function () { W.moveInArray(P.lists, li, li + (+lm[1])); }); return; }
		if ((b = t.closest("[data-gadd]"))) { var gl = W.listById(P, b.getAttribute("data-gadd")); if (gl && gl.groups.length < W.LIM.groups) change(function () { gl.groups.push({ id: W.uid("g"), title: "", mode: "one", here: "", items: [] }); }); return; }
		if ((b = t.closest("[data-gdel]"))) { var gd = b.getAttribute("data-gdel").split("|"), gl2 = W.listById(P, gd[0]); if (gl2) { change(function () { gl2.groups = gl2.groups.filter(function (g) { return g.id !== gd[1]; }); }); toast("Deleted the group", true); } return; }
		if ((b = t.closest("[data-gmove]"))) { var gm = b.getAttribute("data-gmove").split("|"), gl3 = W.listById(P, gm[0]), gi = gl3.groups.findIndex(function (g) { return g.id === gm[1]; }); change(function () { W.moveInArray(gl3.groups, gi, gi + (+gm[2])); }); return; }
		if ((b = t.closest("[data-greset]"))) { var gr = b.getAttribute("data-greset").split("|"); change(function () { W.grpById(P, gr[0], gr[1]).items.forEach(function (x) { x.done = ""; }); }); toast("Checklist cleared (history kept)", true); return; }
		if ((b = t.closest("[data-hd]"))) { selDay = selDay === b.getAttribute("data-hd") ? "" : b.getAttribute("data-hd"); renderHist(); return; }
		if ((b = t.closest("[data-ldel2]"))) { var i = +b.getAttribute("data-ldel2"), en = P.log[i]; if (en) { change(function () { P.log.splice(i, 1); }); toast("Removed " + en.n + " (" + W.shortDate(en.d, today()) + ")", true); } return; }
		if (t.id === "wp-ddclose") { selDay = ""; renderDay(); renderHist(); return; }
		if (t.id === "wp-logthere") { nextDate = selDay; markDone(selDay); return; }
		if (t.id === "wp-ndone") return markDone($("wp-ndate").value);
		if (t.id === "wp-nskip") { change(function () { W.advance(P, U.skip); }); return; }
		if (t.id === "wp-nprev") { change(function () { var i2 = P.days.findIndex(function (d) { return d.id === P.here; }); P.here = P.days[(i2 + P.days.length - 1) % P.days.length].id; }); return; }
		if (t.id === "wp-ntoday") { var tr = W.todayRow(P, today()); if (tr) change(function () { P.here = tr.id; }); return; }
		var c = t.closest(".wp-chip");
		if (c && !t.closest("button,input,select,textarea,a")) openEditor(c.getAttribute("data-item"), c);
	});
	root.addEventListener("change", function (e) {
		var t = e.target, v;
		if ((v = t.getAttribute("data-done"))) {
			var f = W.findItem(P, v); if (!f) return; var on = t.checked;
			change(function () {
				if (on) { f.item.done = today(); W.logItems(P, [f.item], today(), f.where.list); }
				else { var d0 = f.item.done; f.item.done = ""; for (var i = P.log.length - 1; i >= 0; i--) if (P.log[i].d === d0 && P.log[i].n === f.item.name && P.log[i].k === f.where.list) { P.log.splice(i, 1); break; } }
			});
			if (on) toast("Done: " + f.item.name, true);
			return;
		}
		if ((v = t.getAttribute("data-time"))) {
			var raw = t.value.trim(), tm = raw ? W.parseTime(raw) : "";
			if (raw && !tm) { toast("Could not read \"" + raw + "\": try 4:00 PM or 16:00"); render(); return; }
			change(function () { W.dayById(P, v).time = tm; }); return;
		}
		if ((v = t.getAttribute("data-ccol"))) { var cc = t.value; change(function () { W.catById(P, v).color = W.okColor(cc) || W.catById(P, v).color; }); return; }
		if ((v = t.getAttribute("data-gmode"))) { var g = W.grpById.apply(null, [P].concat(v.split("|"))), mode = t.value; change(function () { g.mode = mode; if (mode === "one" && !g.here && g.items[0]) g.here = g.items[0].id; }); return; }
		if (t.id === "wp-ndate") { nextDate = W.okDate(t.value); return; }
	});
	root.addEventListener("input", function (e) {   // text fields that save as you type (one undo step per burst of typing)
		var t = e.target, v;
		if ((v = t.getAttribute("data-cname"))) { snapOnce(); W.catById(P, v).name = W.str(t.value, 40) || "Category"; save(); renderWeek(); return; }
		if ((v = t.getAttribute("data-lname"))) { snapOnce(); W.listById(P, v).name = W.str(t.value, 80) || "Training list"; save(); return; }
		if ((v = t.getAttribute("data-gtitle"))) { snapOnce(); W.grpById.apply(null, [P].concat(v.split("|"))).title = W.str(t.value, 80); save(); return; }
		if ((v = t.getAttribute("data-lnote"))) { snapOnce(); W.listById(P, v).note = W.str(t.value, 600); save(); grow(t); return; }
	});
	root.addEventListener("focusout", function (e) { if (e.target.matches && e.target.matches(".wp-cname,.wp-lname,.wp-gtitle,.wp-lnote")) renderNext(); });
	$("wp-title").addEventListener("input", function () { snapOnce(); P.title = W.str(this.value, 80) || "My Workout Routine"; save(); });
	$("wp-note").addEventListener("input", function () { snapOnce(); P.note = W.str(this.value, 600); save(); grow(this); });
	$("wp-note").addEventListener("change", renderNext);

	function markDone(date) {
		date = W.okDate(date) || today();
		if (date > today()) date = today();
		var d = W.dayById(P, P.here), picked = d.items.filter(function (x) { var cb = root.querySelector('[data-nchk="' + x.id + '"]'); return !cb || cb.checked; });
		var from = W.DOW[d.dow];
		change(function () { if (picked.length) W.logItems(P, picked, date, "w"); W.advance(P, U.skip); });
		toast((picked.length ? "Logged " + picked.length + (picked.length === 1 ? " activity" : " activities") + (date !== today() ? " on " + W.shortDate(date, today()) : "") + ". " : "") + "Moved on from " + from + " to " + W.DOW[W.dayById(P, P.here).dow] + ".", true);
	}
	function groupDone(a) {
		var g = W.grpById(P, a[0], a[1]); if (!g || !g.here) return;
		var f = W.findItem(P, g.here), date = today();
		change(function () { f.item.done = date; W.logItems(P, [f.item], date, a[0]); g.here = W.groupNext(g); });
		toast("Done: " + f.item.name + ". Next: " + W.findItem(P, g.here).item.name, true);
	}
	function addCat() {
		if (P.cats.length >= W.LIM.cats) return;
		var used = P.cats.map(function (c) { return c.color; }), col = W.PALETTE.filter(function (c) { return used.indexOf(c) < 0; })[0] || W.PALETTE[0], id = W.uid("c");
		change(function () { P.cats.push({ id: id, name: "New category", color: col }); });
		var inp = root.querySelector('[data-cname="' + id + '"]'); if (inp) { inp.focus(); inp.select(); }
	}
	function delCat(id) {
		var c = W.catById(P, id); if (!c || P.cats.length < 2) return;
		var n = P.days.reduce(function (s, d) { return s + W.cellItems(d, id).length; }, 0);
		if (n && !window.confirm("Delete the category \"" + c.name + "\"? Its " + n + " planned " + (n === 1 ? "activity moves" : "activities move") + " to \"" + P.cats.find(function (x) { return x.id !== id; }).name + "\".")) return;
		change(function () { var to = P.cats.find(function (x) { return x.id !== id; }).id; P.days.forEach(function (d) { d.items.forEach(function (x) { if (x.cat === id) x.cat = to; }); }); P.cats = P.cats.filter(function (x) { return x.id !== id; }); });
		toast("Deleted the category " + c.name, true);
	}
	$("wp-addlist").addEventListener("click", function () {
		if (P.lists.length >= W.LIM.lists) return toast("That is the most lists one plan can hold.");
		var id = W.uid("l");
		change(function () { P.lists.push({ id: id, name: "New training list", note: "", groups: [{ id: W.uid("g"), title: "", mode: "all", here: "", items: [] }, { id: W.uid("g"), title: "Do one after finishing above", mode: "one", here: "", items: [] }] }); });
		var inp = root.querySelector('[data-lname="' + id + '"]'); if (inp) { inp.focus(); inp.select(); }
	});

	/* keyboard: Alt+arrows move the focused activity, Delete removes it, Enter edits; arrows on a ⠿ grip move the day */
	root.addEventListener("keydown", function (e) {
		var t = e.target;
		if (t.classList && t.classList.contains("wp-grip")) {
			var cols = U.orient === "cols" && layout() !== "cards", k = e.key, step = (k === (cols ? "ArrowLeft" : "ArrowUp")) ? -1 : (k === (cols ? "ArrowRight" : "ArrowDown")) ? 1 : 0;
			if (!step) return; e.preventDefault();
			var id = t.getAttribute("data-grip"), i = P.days.findIndex(function (d) { return d.id === id; });
			if (i + step < 0 || i + step >= P.days.length) return;
			change(function () { W.moveRow(P, i, i + step); }, "g:" + id); return;
		}
		if (!t.classList || !t.classList.contains("wp-chip")) return;
		var iid = t.getAttribute("data-item"), f = W.findItem(P, iid); if (!f) return;
		if (e.key === "Enter" || e.key === " " || e.key === "F2") { e.preventDefault(); openEditor(iid, t); return; }
		if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); var nb = t.nextElementSibling && t.nextElementSibling.matches(".wp-chip") ? t.nextElementSibling : t.previousElementSibling; var nid = nb && nb.getAttribute("data-item"); delItem(iid); if (nid) render("i:" + nid); return; }
		if (!e.altKey || !/^Arrow/.test(e.key)) return;
		e.preventDefault();
		var dest = null, idx = null, k2 = e.key;
		if (f.where.kind === "g") {
			if (k2 === "ArrowUp" || k2 === "ArrowDown") { var to = f.idx + (k2 === "ArrowUp" ? -1 : 1); if (to < 0 || to >= f.arr.length) return; change(function () { W.moveInArray(f.arr, f.idx, to); }, "i:" + iid); }
			return;
		}
		var di = P.days.findIndex(function (d) { return d.id === f.where.day; }), ci = P.cats.findIndex(function (c) { return c.id === f.item.cat; }), cellArr = W.cellItems(P.days[di], f.item.cat), pos = cellArr.indexOf(f.item);
		var cols2 = U.orient === "cols" && layout() !== "cards";
		var dayKey = cols2 ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 }, catKey = cols2 ? { ArrowUp: -1, ArrowDown: 1 } : { ArrowLeft: -1, ArrowRight: 1 };
		if (e.shiftKey && catKey[k2]) { idx = pos + catKey[k2]; if (idx < 0 || idx >= cellArr.length) return; dest = { kind: "c", day: f.where.day, cat: f.item.cat }; }
		else if (dayKey[k2]) { var nd = P.days[di + dayKey[k2]]; if (!nd) return; dest = { kind: "c", day: nd.id, cat: f.item.cat }; }
		else if (catKey[k2]) { var nc = P.cats[ci + catKey[k2]]; if (!nc) return; dest = { kind: "c", day: f.where.day, cat: nc.id }; }
		if (dest) change(function () { W.moveItem(P, iid, dest, idx); }, "i:" + iid);
	});
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && EDIT) { closeEditor(true); return; }
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
			var a = document.activeElement; if (a && (a.tagName === "INPUT" && a.type === "text" || a.tagName === "TEXTAREA")) return;
			if (!root.contains(a) && a !== document.body) return;
			if (UNDO.length) { e.preventDefault(); doUndo(); }
		}
	});
	$("wp-undo").addEventListener("click", doUndo);

	/* ---------- drag and drop (pointer events) ---------- */
	var D = null, IND = null, GHOST = null, AUTO = 0;
	function ind() { if (!IND) { IND = document.createElement("div"); IND.className = "wp-ind"; document.body.appendChild(IND); } return IND; }
	root.addEventListener("pointerdown", function (e) {
		if (e.button > 0 || D) return;
		var g = e.target.closest(".wp-grip"), c = e.target.closest(".wp-chip");
		if (!g && !c) return;
		if (c && !g && e.target.closest("button,input,select,textarea,a,label")) return;
		var touch = e.pointerType !== "mouse";
		D = { kind: g ? "row" : "item", id: g ? g.getAttribute("data-grip") : c.getAttribute("data-item"), el: g ? root.querySelector('[data-row="' + g.getAttribute("data-grip") + '"]') : c, src: g || c,
			x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, pid: e.pointerId, touch: touch, started: false, target: null, copy: false };
		if (g) e.preventDefault();
		if (touch && !g) D.timer = setTimeout(function () { if (D && !D.started) begin(); }, 300);
		document.addEventListener("pointermove", onMove, { passive: false });
		document.addEventListener("pointerup", onUp);
		document.addEventListener("pointercancel", onCancel);
	});
	function block(e) { if (D && D.started) e.preventDefault(); }
	function begin() {
		D.started = true;
		if (D.touch && navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
		document.addEventListener("touchmove", block, { passive: false });
		var r = D.src.getBoundingClientRect();
		GHOST = (D.kind === "row" ? (function () { var s = document.createElement("div"); s.className = "wp-chip wp-ghostrow"; var dd = W.dayById(P, D.id); s.textContent = "⠿ " + W.DOW[dd.dow] + (dd.items.length ? " · " + dd.items.map(function (x) { return x.name; }).join(", ") : ""); return s; })() : D.src.cloneNode(true));
		GHOST.classList.add("wp-ghost"); GHOST.removeAttribute("tabindex"); GHOST.removeAttribute("data-item");
		GHOST.style.width = D.kind === "row" ? "" : Math.min(r.width, 320) + "px";
		D.dx = D.kind === "row" ? 14 : D.x0 - r.left; D.dy = D.kind === "row" ? 14 : D.y0 - r.top;
		(document.querySelector(".mes-pfill:fullscreen") || document.body).appendChild(GHOST);
		D.el && D.el.classList.add("wp-src");
		root.classList.add("wp-dragging");
		if (EDIT) closeEditor();
		AUTO = setInterval(autoScroll, 16);
		track();
	}
	function onMove(e) {
		if (!D || e.pointerId !== D.pid) return;
		D.x = e.clientX; D.y = e.clientY; D.copy = e.altKey;
		if (!D.started) {
			var dist = Math.hypot(D.x - D.x0, D.y - D.y0);
			if (D.touch && D.kind === "item") { if (dist > 10) cleanup(); return; }
			if (dist < 5) return;
			begin();
		}
		e.preventDefault();
		track();
	}
	function track() {
		GHOST.style.transform = "translate(" + (D.x - D.dx) + "px," + (D.y - D.dy) + "px)";
		GHOST.classList.toggle("is-copy", !!D.copy && D.kind === "item");
		var i = ind(); i.style.display = "none";
		Array.prototype.forEach.call(root.querySelectorAll(".wp-over"), function (x) { x.classList.remove("wp-over"); });
		D.target = null;
		var under = document.elementFromPoint(D.x, D.y);
		if (D.kind === "row") return trackRow(i);
		var drop = under && under.closest && under.closest("[data-drop]");
		if (!drop || !root.contains(drop)) return;
		var axis = drop.getAttribute("data-axis"), kids = Array.prototype.filter.call(drop.children, function (k) { return k.classList.contains("wp-chip") && k !== D.el; }), idx = kids.length, ref = null, after = false;
		for (var k = 0; k < kids.length; k++) {
			var r = kids[k].getBoundingClientRect();
			if (axis === "y" ? D.y < r.top + r.height / 2 : (D.y < r.top || (D.y <= r.bottom && D.x < r.left + r.width / 2))) { idx = k; ref = r; break; }
		}
		if (!ref && kids.length) { ref = kids[kids.length - 1].getBoundingClientRect(); after = true; }
		drop.classList.add("wp-over");
		D.target = { spec: drop.getAttribute("data-drop").split("|"), index: idx };
		if (!ref) return;
		i.style.display = "block";
		if (axis === "y") { i.style.left = ref.left + "px"; i.style.width = ref.width + "px"; i.style.height = "3px"; i.style.top = ((after ? ref.bottom + 2 : ref.top - 3)) + "px"; }
		else { i.style.top = ref.top + "px"; i.style.height = ref.height + "px"; i.style.width = "3px"; i.style.left = ((after ? ref.right + 2 : ref.left - 4)) + "px"; }
	}
	function trackRow(i) {
		var x = layout() !== "cards" && U.orient === "cols", rows = Array.prototype.filter.call($("wp-week").querySelectorAll("[data-row]"), function (r) { return r.getAttribute("data-row") !== D.id; });
		if (!rows.length) return;
		var idx = rows.length, ref = null, after = false;
		for (var k = 0; k < rows.length; k++) { var r = rows[k].getBoundingClientRect(); if (x ? D.x < r.left + r.width / 2 : D.y < r.top + r.height / 2) { idx = k; ref = r; break; } }
		if (!ref) { ref = rows[rows.length - 1].getBoundingClientRect(); after = true; }
		D.target = { row: idx };
		var tb = $("wp-week").querySelector("table"), tr = tb ? tb.getBoundingClientRect() : null;
		i.style.display = "block";
		if (x) { i.style.top = (tr ? tr.top : ref.top) + "px"; i.style.height = (tr ? tr.height : ref.height) + "px"; i.style.width = "3px"; i.style.left = (after ? ref.right : ref.left - 2) + "px"; }
		else { i.style.left = (tr ? tr.left : ref.left) + "px"; i.style.width = (tr ? tr.width : ref.width) + "px"; i.style.height = "3px"; i.style.top = (after ? ref.bottom : ref.top - 2) + "px"; }
	}
	function autoScroll() {
		if (!D || !D.started) return;
		var fill = document.querySelector(".mes-pfill"), edge = 56, sp = 0, vh = window.innerHeight;
		if (D.y < edge) sp = -Math.ceil((edge - D.y) / 4); else if (D.y > vh - edge) sp = Math.ceil((D.y - (vh - edge)) / 4);
		var wrap = document.elementFromPoint(D.x, D.y); wrap = wrap && wrap.closest && wrap.closest(".wp-tablewrap");
		var hs = 0; if (wrap) { var r = wrap.getBoundingClientRect(); if (D.x < r.left + 40) hs = -8; else if (D.x > r.right - 40) hs = 8; if (hs) wrap.scrollLeft += hs; }
		if (!sp) return;
		if (fill) fill.scrollTop += sp; else window.scrollBy(0, sp);
		track();
	}
	function onUp(e) {
		if (!D || e.pointerId !== D.pid) return;
		var d = D;
		if (d.started) {
			suppressClick = true; setTimeout(function () { suppressClick = false; }, 60);
			var t = d.target;
			cleanup();
			if (t && d.kind === "row") {
				var from = P.days.findIndex(function (x) { return x.id === d.id; });
				if (t.row !== from) change(function () { W.moveRow(P, from, t.row); });
			} else if (t && d.kind === "item") {
				var s = t.spec, dest = s[0] === "c" ? { kind: "c", day: s[1], cat: s[2] } : { kind: "g", list: s[1], grp: s[2] };
				var f = W.findItem(P, d.id), same = f && (dest.kind === "c" ? f.where.kind === "c" && f.where.day === dest.day && f.item.cat === dest.cat : f.where.kind === "g" && f.where.grp === dest.grp);
				var oldPos = f ? (f.where.kind === "c" ? W.cellItems(W.dayById(P, f.where.day), f.item.cat).indexOf(f.item) : f.idx) : -1;
				if (!(same && !d.copy && oldPos === t.index)) {
					change(function () { W.moveItem(P, d.id, dest, t.index, d.copy); });
					if (d.copy) toast("Copied", true);
				}
			}
		} else cleanup();
	}
	function onCancel(e) { if (D && e.pointerId === D.pid) cleanup(); }
	function cleanup() {
		if (!D) return;
		clearTimeout(D.timer); clearInterval(AUTO);
		document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("pointercancel", onCancel);
		document.removeEventListener("touchmove", block);
		if (GHOST) GHOST.remove(); GHOST = null;
		if (IND) IND.style.display = "none";
		D.el && D.el.classList.remove("wp-src");
		root.classList.remove("wp-dragging");
		Array.prototype.forEach.call(root.querySelectorAll(".wp-over"), function (x) { x.classList.remove("wp-over"); });
		D = null;
	}
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && D) { cleanup(); toast("Drag cancelled"); } });
	root.addEventListener("contextmenu", function (e) { if (D && D.touch) e.preventDefault(); });

	/* ---------- toolbar: segments, templates, share, export, import ---------- */
	$("wp-orient").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; U.orient = b.getAttribute("data-o"); saveUI(); render(); });
	$("wp-lay").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; U.lay = b.getAttribute("data-l"); saveUI(); render(); });
	$("wp-weeks").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; U.weeks = +b.getAttribute("data-w"); saveUI(); renderHist(); segs(); });
	$("wp-ws").addEventListener("change", function () { U.ws = +this.value ? 1 : 0; saveUI(); renderHist(); });
	$("wp-skip").addEventListener("change", function () { U.skip = this.checked; saveUI(); renderNext(); });
	if (mq.addEventListener) mq.addEventListener("change", function () { if (U.lay === "auto") render(); });

	$("wp-tplsel").innerHTML = Object.keys(W.TEMPLATES).map(function (k) { return '<option value="' + k + '">' + esc(W.TEMPLATES[k].name) + "</option>"; }).join("");
	$("wp-tplgo").addEventListener("click", function () {
		var k = $("wp-tplsel").value, t = W.template(k);
		change(function () { var log = P.log; P = t; P.log = log; });
		toast("Loaded \"" + W.TEMPLATES[k].name + "\". Your history is kept.", true);
	});

	function shareUrl() { return location.origin + "/workout-planner?p=" + W.encodeShare(P); }
	function copyText(txt, msg) {
		function fallback() { var ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); toast(ok ? msg : "Copy failed: select and copy by hand"); if (!ok) window.prompt("Copy this:", txt); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast(msg); }, fallback); else fallback();
	}
	$("wp-share").addEventListener("click", function () { copyText(shareUrl(), "Share link copied: it holds your week and lists, not your history"); });

	function download(name, type, text) {
		var a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: type }));
		a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
	}
	function fileBase() { return (P.title || "workout-plan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "workout-plan"; }
	function tableHtml(rows, head) {
		return "<table border=\"1\" style=\"border-collapse:collapse\">" + rows.map(function (r, i) { var tg = head && i === 0 ? "th" : "td"; return "<tr>" + r.map(function (c) { return "<" + tg + (head && i === 0 ? ' style="background:#ffff00"' : "") + ">" + esc(c).replace(/\n/g, "<br>") + "</" + tg + ">"; }).join("") + "</tr>"; }).join("") + "</table>";
	}
	function exportAs(kind) {
		$("wp-exp").open = false;
		var td = today();
		if (kind === "csv") { download(fileBase() + ".csv", "text/csv;charset=utf-8", "﻿" + W.planCSV(P, td)); toast("CSV downloaded"); }
		else if (kind === "json") { download(fileBase() + "-backup-" + td + ".json", "application/json", JSON.stringify({ app: "mes-workout-planner", saved: new Date().toISOString(), plan: P }, null, 1)); toast("Backup downloaded (plan + history)"); }
		else if (kind === "print") { buildPrint(); window.print(); }
		else if (kind === "excel") {
			var rows = W.grid(P, H24); if (P.note) rows.push([P.note]);
			var tsv = W.toTSV(rows), html = "<meta charset=\"utf-8\">" + tableHtml(rows, true);
			if (P.lists.length) { var lg = W.listGrid(P, td); tsv += "\n\n" + W.toTSV(lg); html += "<br>" + tableHtml(lg, false); }
			if (navigator.clipboard && window.ClipboardItem) {
				navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([tsv], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]).then(function () { toast("Copied: paste it into Excel or Google Sheets"); }, function () { copyText(tsv, "Copied as text: paste it into Excel or Google Sheets"); });
			} else copyText(tsv, "Copied as text: paste it into Excel or Google Sheets");
		}
	}
	Array.prototype.forEach.call(root.querySelectorAll(".wp-menu"), function (dm) {   // keep the dropdown on screen; one open at a time
		dm.addEventListener("toggle", function () {
			var pop = dm.querySelector(".wp-menupop"); pop.style.left = "0px";
			if (!dm.open) return;
			Array.prototype.forEach.call(root.querySelectorAll(".wp-menu"), function (o) { if (o !== dm) o.open = false; });
			var r = pop.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 8);
			if (over > 0) pop.style.left = Math.max(-r.left + 8, -over) + "px";
		});
	});
	document.addEventListener("click", function (e) { Array.prototype.forEach.call(root.querySelectorAll(".wp-menu[open]"), function (dm) { if (!dm.contains(e.target)) dm.open = false; }); });
	$("wp-exp").addEventListener("click", function (e) { var b = e.target.closest("[data-exp]"); if (b) exportAs(b.getAttribute("data-exp")); });

	function buildPrint() {
		var pr = $("wp-print"); if (!pr) { pr = document.createElement("div"); pr.id = "wp-print"; document.body.appendChild(pr); }
		var g = W.grid(P, H24), td = today();
		var h = "<h1>" + esc(P.title) + "</h1><table><thead><tr>" + g[0].map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
			g.slice(1).map(function (r, i) { var d = P.days[i]; return '<tr class="' + (d.id === P.here ? "is-here" : "") + '">' + r.map(function (c, j) { return "<td>" + (j >= 2 && j < r.length - 1 ? esc(c).split("; ").join("<br>") : j === r.length - 1 && c ? "📍 " + esc(c) : esc(c)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
		if (P.note) h += "<p><i>" + esc(P.note) + "</i></p>";
		P.lists.forEach(function (l) {
			h += '<div class="wp-plist"><h2>' + esc(l.name) + "</h2>";
			l.groups.forEach(function (gr) {
				h += "<h3>" + esc(gr.title || (gr.mode === "one" ? "Do one, in turn" : "Do all")) + (gr.mode === "one" ? " (do one, in turn)" : "") + "</h3><ul>" +
					gr.items.map(function (x) { return "<li>" + (gr.mode === "all" ? (x.done ? "☑ " : "☐ ") : "") + esc(W.itemText(x)) + (x.done ? " <b>Done " + esc(W.shortDate(x.done, td)) + "</b>" : "") + (gr.mode === "one" && gr.here === x.id ? " <b>📍 Here</b>" : "") + "</li>"; }).join("") + "</ul>";
			});
			if (l.note) h += "<p><i>" + esc(l.note) + "</i></p>";
			h += "</div>";
		});
		pr.innerHTML = h + '<p class="wp-pfoot">mes.fm/workout-planner · ' + esc(td) + "</p>";
	}
	window.addEventListener("beforeprint", buildPrint);

	function impMsg(m, bad) { var el = $("wp-impmsg"); el.textContent = m; el.classList.toggle("is-bad", !!bad); }
	function importTable(text) {
		var r = W.parseTable(text, P);
		if (r.error) return impMsg(r.error, true);
		change(function () { var lists = P.lists, log = P.log, title = P.title; P = r.plan; P.lists = lists; P.log = log; P.title = title; if (!P.note && r.plan.note === "") P.note = ""; });
		impMsg("Imported " + P.days.reduce(function (s, d) { return s + d.items.length; }, 0) + " activities in " + P.cats.length + " categories." + (r.notes.length ? " " + r.notes.join(" ") : ""));
		toast("Week imported", true);
	}
	$("wp-impgo").addEventListener("click", function () { importTable($("wp-imptext").value); });
	$("wp-imptext").addEventListener("paste", function () { setTimeout(function () { if ($("wp-imptext").value.trim()) impMsg("Pasted. Press \"Import the week\" to replace the week (lists and history stay)."); }, 0); });
	$("wp-impfile").addEventListener("change", function () { var f = this.files && this.files[0]; if (!f) return; f.text().then(function (t) { $("wp-imptext").value = t; importTable(t); }); this.value = ""; });
	$("wp-impjson").addEventListener("change", function () {
		var f = this.files && this.files[0]; if (!f) return; this.value = "";
		f.text().then(function (t) {
			var o; try { o = JSON.parse(t); } catch (e) { return impMsg("That file is not a backup from this page.", true); }
			var plan = o && o.plan ? o.plan : o;
			if (!plan || !Array.isArray(plan.days)) return impMsg("That file is not a backup from this page.", true);
			change(function () { P = W.normalize(plan); });
			impMsg("Backup restored: " + P.log.length + " history entries."); toast("Backup restored", true);
		});
	});

	/* ---------- a shared link ---------- */
	(function () {
		var m = /[?&]p=([^&#]+)/.exec(location.search); if (!m) return;
		var plan = W.decodeShare(decodeURIComponent(m[1]));
		try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
		if (!plan) { toast("That share link is damaged, so your own plan is shown."); return; }
		if (!hadData) { var log = P.log; P = plan; P.log = log; save(); toast("Opened the shared plan \"" + plan.title + "\""); return; }
		if (W.sameDays(plan, P)) { toast("This link is the plan you already have."); return; }
		$("wp-sharename").textContent = "\"" + plan.title + "\"";
		$("wp-sharebar").hidden = false;
		$("wp-shareuse").onclick = function () { change(function () { var log = P.log; P = plan; P.log = log; }); $("wp-sharebar").hidden = true; toast("Now using the shared plan", true); };
		$("wp-sharekeep").onclick = function () { $("wp-sharebar").hidden = true; };
	})();

	/* ---------- Fill window / Full screen ---------- */
	function panels() {
		if (!window.MESPanel) return;
		window.MESPanel.add($("wp-weekcard"), { bar: $("wp-weekbar").querySelector(".wp-headctl"), onChange: function () { render(); placeEditor(); } });
		window.MESPanel.add($("wp-listcard"), { bar: $("wp-listbar"), onChange: placeEditor });
	}
	if (window.MESPanel) panels(); else window.addEventListener("load", panels);

	render();
	save();
	setInterval(function () { var td = today(); if (td !== render._day) { render._day = td; render(); } }, 60000); render._day = today();
})();
