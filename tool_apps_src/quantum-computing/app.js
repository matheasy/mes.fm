/* MES Quantum Computer Simulator (mes.fm/quantum-computing): circuit editor, live state vector, Bloch sphere, shots, QASM. Maths in lib.js (MESQComp). */
(function () {
	"use strict";
	var M = window.MESQComp, root = document.getElementById("qx");
	if (!M || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-quantum-computing:v1", PI = Math.PI;
	var CW = 54, RH = 52, LW = 70, TOP = 24, ENDW = 92, BOX = 40;

	/* ---------------------------------------------------------------- state */
	var S = { circ: M.preset("bell"), step: null, mode: "amp", hz: false, bq: 0, yaw: -2.1, pitch: 0.35, sn: 1024, seed: 1, ex: "bell" };
	var hist = [], fut = [], sel = null, placing = null, playT = 0, shotRes = null, res = null;
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ c: M.encode(S.circ), mode: S.mode, hz: S.hz, bq: S.bq, sn: S.sn, ex: S.ex })); } catch (e) {} }
	function load() {
		try {
			var q = new URLSearchParams(location.search), d = null;
			if (q.get("c")) { try { S.circ = M.decode(q.get("c")); S.ex = ""; d = 1; } catch (e) { toast("That link's circuit could not be read: " + e.message); } }
			else if (q.get("ex") && M.preset(q.get("ex"))) { S.circ = M.preset(q.get("ex")); S.ex = q.get("ex"); d = 1; }
			var o = JSON.parse(localStorage.getItem(KEY) || "null");
			if (o) { S.mode = o.mode === "prob" ? "prob" : "amp"; S.hz = !!o.hz; S.sn = +o.sn || 1024; if (!d) { try { S.circ = M.decode(o.c); S.ex = o.ex || ""; } catch (e) {} S.bq = +o.bq || 0; } }
			if (d && history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
		} catch (e) {}
		if (S.bq >= S.circ.n) S.bq = 0;
	}
	function toast(t) { var el = document.querySelector(".tu-toast"); if (!el) { el = document.createElement("div"); el.className = "tu-toast"; document.body.appendChild(el); } el.textContent = t; el.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("tu-toast--show"); }, 2400); }
	function snapshot() { hist.push(M.encode(S.circ)); if (hist.length > 100) hist.shift(); fut = []; }
	function changed(keepStep) { S.circ = M.prune(S.circ); if (!keepStep) S.step = null; shotRes = null; S.ex = S.ex && S.ex.charAt(0) === "~" ? S.ex : ""; save(); render(); }
	function undo() { if (!hist.length) return; fut.push(M.encode(S.circ)); S.circ = M.decode(hist.pop()); sel = null; changed(); }
	function redo() { if (!fut.length) return; hist.push(M.encode(S.circ)); S.circ = M.decode(fut.pop()); sel = null; changed(); }
	function dark() { return document.body.classList.contains("dark-mode"); }
	function cvar(n) { return getComputedStyle(root).getPropertyValue(n).trim(); }

	/* ---------------------------------------------------------------- palette */
	var PAL = [
		["H", "H", "Hadamard: makes an equal superposition"], ["X", "X", "Pauli X: NOT, flips 0 and 1"], ["Y", "Y", "Pauli Y"], ["Z", "Z", "Pauli Z: flips the sign of |1⟩"],
		["S", "S", "S: phase of 90° on |1⟩"], ["T", "T", "T: phase of 45° on |1⟩"], ["SDG", "S†", "S inverse"], ["TDG", "T†", "T inverse"], ["SX", "√X", "Square root of NOT"],
		["RX", "Rx", "Turn about the x axis by an angle"], ["RY", "Ry", "Turn about the y axis by an angle"], ["RZ", "Rz", "Turn about the z axis by an angle"], ["P", "P", "Phase P(φ) on |1⟩"],
		["|"], ["CX", "CNOT", "Controlled NOT: control here, target on the next wire"], ["CZ", "CZ", "Controlled Z"], ["SWAP", "Swap", "Swap two qubits"], ["CCX", "Toffoli", "Doubly controlled NOT (3 qubits)"],
		["CTRL", "● Control", "Drop on another wire next to a gate to add a control"], ["|"], ["M", "Measure", "Measure the qubit (read out 0 or 1)"]
	];
	function buildPal() {
		var h = "";
		PAL.forEach(function (p) {
			if (p[0] === "|") { h += '<span class="qx-psep" aria-hidden="true"></span>'; return; }
			h += '<button type="button" class="qx-pg qx-pg--' + p[0].toLowerCase() + '" data-g="' + p[0] + '" title="' + p[2] + '" aria-pressed="false">' + p[1] + "</button>";
		});
		$("qx-pal").innerHTML = h;
	}
	function newOp(g, q) {
		var n = S.circ.n;
		function need(k) { if (n < k) { toast("This gate needs " + k + " qubits: add a qubit with +"); return false; } return true; }
		function base(k) { return Math.max(0, Math.min(q, n - k)); }
		if (g === "CX" || g === "CZ") { if (!need(2)) return null; var t = q + 1 < n ? q + 1 : q - 1; return M.op(g === "CX" ? "X" : "Z", t, q); }
		if (g === "SWAP") { if (!need(2)) return null; var b = base(2); return M.op("SWAP", [b, b + 1]); }
		if (g === "CCX") { if (!need(3)) return null; var b3 = base(3); return M.op("X", b3 + 2, [b3, b3 + 1]); }
		return M.op(g, q, null, M.GATES[g].par ? PI / 2 : null);
	}
	// put op into column col: in a free spot, replacing a lone single-qubit gate on the same wire, or in a new column inserted there
	function placeOp(op, col) {
		var cols = S.circ.cols;
		while (cols.length < col) cols.push([]);
		if (col >= cols.length) { cols.push([op]); return; }
		var c = cols[col], hit = c.filter(function (o) { return M.overlaps(o, op); });
		if (!hit.length) { c.push(op); return; }
		var single = op.q.length === 1 && !op.c.length;
		if (single && hit.length === 1 && hit[0].q.length === 1 && !hit[0].c.length && hit[0].q[0] === op.q[0]) { c[c.indexOf(hit[0])] = op; return; }
		cols.splice(col, 0, [op]);
	}
	function addControl(col, q) {
		var c = S.circ.cols[col];
		if (!c) { toast("Drop the control dot in a column that already has a gate."); return false; }
		var cand = c.filter(function (o) { return M.wires(o).indexOf(q) < 0 && o.g !== "M"; });
		if (!cand.length) { toast("Drop the control dot on a wire next to a gate (not on the gate itself)."); return false; }
		cand.sort(function (a, b) { return dist(a, q) - dist(b, q); });
		var op = cand[0], trial = M.clean(op); trial.c.push(q);
		if (!M.colFree(c, trial, op)) { c.splice(c.indexOf(op), 1); placeOp(trial, col); toast("Moved the gate to its own column to make room for the control."); return true; }
		c[c.indexOf(op)] = trial; return true;
	}
	function dist(op, q) { var s = M.span(op); return q < s[0] ? s[0] - q : q > s[1] ? q - s[1] : 0; }

	/* ---------------------------------------------------------------- circuit drawing */
	var grid = $("qx-grid"), circEl = $("qx-circ");
	function ncols() { return Math.max(S.circ.cols.length + 3, 12); }
	function stepNow() { return S.step == null ? S.circ.cols.length : Math.min(S.step, S.circ.cols.length); }
	function gx(c) { return LW + c * CW + CW / 2; }
	function gy(q) { return TOP + q * RH + RH / 2; }
	function opHtml(op, ci, oi) {
		var x = gx(ci), w = M.wires(op), sp = M.span(op), h = "", cls = "qx-op" + (sel && sel.ci === ci && sel.oi === oi ? " is-sel" : ""), d = ' data-ci="' + ci + '" data-oi="' + oi + '"';
		var G = M.GATES[op.g], ctrl = op.c.length > 0;
		h += '<div class="' + cls + '"' + d + ">";
		if (sp[1] > sp[0]) h += '<div class="qx-vl" style="left:' + (x - 1) + "px;top:" + gy(sp[0]) + "px;height:" + (gy(sp[1]) - gy(sp[0])) + 'px"></div>';
		op.c.forEach(function (q) { h += '<div class="qx-dot" style="left:' + (x - 7) + "px;top:" + (gy(q) - 7) + 'px"></div>'; });
		op.q.forEach(function (q) {
			if (op.g === "SWAP") { h += '<div class="qx-sw" style="left:' + (x - 10) + "px;top:" + (gy(q) - 10) + 'px">×</div>'; return; }
			if (op.g === "X" && ctrl) { h += '<div class="qx-plus" style="left:' + (x - 14) + "px;top:" + (gy(q) - 14) + 'px"></div>'; return; }
			if (op.g === "Z" && ctrl) { h += '<div class="qx-dot" style="left:' + (x - 7) + "px;top:" + (gy(q) - 7) + 'px"></div>'; return; }
			var lab = op.g === "M" ? '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 17a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 17 17 9" stroke="currentColor" stroke-width="2"/></svg>' : esc(G.label);
			var sub = G.par ? '<small>' + esc(M.fmtAngle(op.p)) + "</small>" : "";
			h += '<div class="qx-gb qx-gb--' + op.g.toLowerCase() + (sub ? " has-sub" : "") + '" style="left:' + (x - BOX / 2) + "px;top:" + (gy(q) - BOX / 2) + 'px"><span>' + lab + "</span>" + sub + "</div>";
		});
		h += '<div class="qx-hit" style="left:' + (x - BOX / 2) + "px;top:" + (gy(sp[0]) - BOX / 2) + "px;width:" + BOX + "px;height:" + (gy(sp[1]) - gy(sp[0]) + BOX) + 'px" tabindex="0" role="button" aria-label="' + esc(opName(op)) + ", column " + (ci + 1) + '"></div>';
		void w;
		return h + "</div>";
	}
	function opName(op) {
		var G = M.GATES[op.g], s = op.c.length === 1 && op.g === "X" ? "CNOT" : op.c.length === 2 && op.g === "X" ? "Toffoli" : op.c.length === 1 && op.g === "SWAP" ? "Fredkin (controlled swap)" : (op.c.length ? (op.c.length === 1 ? "Controlled " : op.c.length === 2 ? "Doubly controlled " : op.c.length + "-controlled ") : "") + G.name;
		return s + (G.par ? " (" + M.fmtAngle(op.p) + ")" : "");
	}
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function drawCirc() {
		var n = S.circ.n, nc = ncols(), W = LW + nc * CW + ENDW, H = TOP + n * RH + 6, st = stepNow(), h = "", ones = M.ones(res.state);
		grid.style.width = W + "px"; grid.style.height = H + "px";
		for (var c = 0; c < nc; c++) h += '<button type="button" class="qx-cn' + (c < S.circ.cols.length ? "" : " is-empty") + (c === st - 1 ? " is-cur" : "") + '" data-col="' + c + '" style="left:' + (LW + c * CW) + "px;width:" + CW + 'px" title="Show the state after column ' + (c + 1) + '">' + (c + 1) + "</button>";
		for (var q = 0; q < n; q++) {
			var y = gy(q), p1 = ones[q];
			h += '<div class="qx-wire" style="left:' + LW + "px;top:" + y + "px;width:" + (nc * CW) + 'px"></div>';
			h += '<button type="button" class="qx-ql' + (q === S.bq ? " is-on" : "") + '" data-q="' + q + '" style="top:' + (y - 16) + 'px" title="Show q' + q + ' on the Bloch sphere">q' + q + ' <span>|0⟩</span></button>';
			h += '<div class="qx-p1" style="left:' + (LW + nc * CW + 10) + "px;top:" + (y - 11) + 'px" title="Chance that q' + q + ' reads 1"><i style="width:' + (p1 * 100).toFixed(1) + '%"></i><b>' + fmtPct(p1) + "</b></div>";
		}
		h += '<div class="qx-mark" style="left:' + (LW + st * CW - 1) + "px;top:" + (TOP - 4) + "px;height:" + (n * RH + 6) + 'px"></div>';
		S.circ.cols.forEach(function (col, ci) {
			if (ci >= st) h += '<div class="qx-fade" style="left:' + (LW + ci * CW) + "px;top:" + TOP + "px;width:" + CW + "px;height:" + (n * RH) + 'px"></div>';
			col.forEach(function (op, oi) { h += opHtml(op, ci, oi); });
		});
		h += '<div class="qx-ghostcell" id="qx-gc" hidden></div>';
		grid.innerHTML = h;
		grid.classList.toggle("is-placing", !!placing);
	}
	function legC() { return [0, 90, 180, 270].map(function (h) { return '<b style="color:hsl(' + h + ',78%,' + (dark() ? (h === 270 ? 74 : 62) : (h === 0 || h === 270 ? 45 : 32)) + '%)">' + h + "°</b>"; }).join(" · "); }
	function fmtPct(p) { return p < 0.0005 ? "0%" : p > 0.9995 ? "100%" : (p * 100).toFixed(p < 0.1 || p > 0.9 ? 1 : 0) + "%"; }

	/* ---------------------------------------------------------------- pointer: palette drag / click-to-place, moving gates */
	var drag = null;
	function cellAt(cx, cy) {
		var r = grid.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
		if (x < LW - 10 || x > LW + ncols() * CW + 10 || y < TOP - 14 || y > TOP + S.circ.n * RH + 14) return null;
		return { c: Math.max(0, Math.min(ncols() - 1, Math.floor((x - LW) / CW))), q: Math.max(0, Math.min(S.circ.n - 1, Math.floor((y - TOP) / RH))) };
	}
	function showGhost(cell) {
		var g = $("qx-gc"); if (!g) return;
		if (!cell) { g.hidden = true; return; }
		g.hidden = false; g.style.left = (LW + cell.c * CW + 3) + "px"; g.style.top = (TOP + cell.q * RH + 3) + "px";
	}
	function startDrag(e, kind, data, label) {
		var fl = document.createElement("div"); fl.className = "qx-float"; fl.textContent = label; document.body.appendChild(fl);
		drag = { kind: kind, data: data, fl: fl, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
		moveFloat(e);
	}
	function moveFloat(e) { if (!drag) return; drag.fl.style.left = e.clientX + "px"; drag.fl.style.top = e.clientY + "px"; }
	$("qx-pal").addEventListener("pointerdown", function (e) {
		var b = e.target.closest(".qx-pg"); if (!b || e.button > 0) return;
		e.preventDefault(); startDrag(e, "pal", b.dataset.g, b.textContent); drag.btn = b;
	});
	grid.addEventListener("pointerdown", function (e) {
		if (e.button > 0) return;
		var hit = e.target.closest(".qx-hit");
		if (hit) {
			var o = hit.parentNode, ci = +o.dataset.ci, oi = +o.dataset.oi, op = S.circ.cols[ci][oi], cell = cellAt(e.clientX, e.clientY);
			e.preventDefault(); startDrag(e, "op", { ci: ci, oi: oi, op: op, q0: cell ? cell.q : M.span(op)[0] }, M.GATES[op.g].label);
			drag.fl.hidden = true;
			return;
		}
		if (placing) { var c = cellAt(e.clientX, e.clientY); if (c) { e.preventDefault(); dropPal(placing, c); } }
	});
	grid.addEventListener("pointermove", function (e) { if (!drag && placing) showGhost(cellAt(e.clientX, e.clientY)); });
	grid.addEventListener("pointerleave", function () { if (!drag) showGhost(null); });
	window.addEventListener("pointermove", function (e) {
		if (!drag || e.pointerId !== drag.id) return;
		if (!drag.moved && Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 6) { drag.moved = true; drag.fl.hidden = false; document.documentElement.classList.add("qx-dragging"); if (drag.kind === "op") grid.querySelector('.qx-op[data-ci="' + drag.data.ci + '"][data-oi="' + drag.data.oi + '"]').classList.add("is-drag"); }
		if (drag.moved) { moveFloat(e); showGhost(cellAt(e.clientX, e.clientY)); }
	});
	window.addEventListener("pointerup", function (e) {
		if (!drag || e.pointerId !== drag.id) return;
		var d = drag; drag = null; d.fl.remove(); document.documentElement.classList.remove("qx-dragging"); showGhost(null);
		var cell = cellAt(e.clientX, e.clientY);
		if (d.kind === "pal") {
			if (!d.moved) { setPlacing(placing === d.data ? null : d.data); return; }
			if (cell) dropPal(d.data, cell);
			return;
		}
		// existing gate
		if (!d.moved) { sel = { ci: d.data.ci, oi: d.data.oi }; render(); return; }
		snapshot();
		var col = S.circ.cols[d.data.ci], op = d.data.op; col.splice(col.indexOf(op), 1);
		if (!cell) { sel = null; toast("Gate removed (Undo brings it back)."); changed(); return; }
		var dq = cell.q - d.data.q0, sp = M.span(op); dq = Math.max(-sp[0], Math.min(S.circ.n - 1 - sp[1], dq));
		var no = M.clean(op); no.q = no.q.map(function (q) { return q + dq; }); no.c = no.c.map(function (q) { return q + dq; });
		var target = cell.c;
		if (col.length === 0 && target > d.data.ci) target--; // the old column disappears
		S.circ.cols = S.circ.cols.filter(function (c) { return c.length; });
		placeOp(no, Math.min(target, S.circ.cols.length));
		sel = findOp(no); changed();
	});
	window.addEventListener("pointercancel", function () { if (drag) { drag.fl.remove(); drag = null; document.documentElement.classList.remove("qx-dragging"); render(); } });
	function findOp(op) { for (var ci = 0; ci < S.circ.cols.length; ci++) { var oi = S.circ.cols[ci].indexOf(op); if (oi >= 0) return { ci: ci, oi: oi }; } return null; }
	function dropPal(g, cell) {
		if (g === "CTRL") { snapshot(); if (addControl(cell.c, cell.q)) { sel = null; changed(); } else hist.pop(); return; }
		var op = newOp(g, cell.q); if (!op) return;
		snapshot(); placeOp(op, Math.min(cell.c, S.circ.cols.length)); sel = findOp(op); changed();
	}
	function setPlacing(g) {
		placing = g;
		[].forEach.call($("qx-pal").querySelectorAll(".qx-pg"), function (b) { b.setAttribute("aria-pressed", b.dataset.g === g ? "true" : "false"); });
		$("qx-tip").textContent = g ? "Now click a spot on a wire to place it (Esc to stop). Click the gate again to stop." : "Drag a gate onto a wire, or click a gate and then click a spot. Click a gate in the circuit to change or delete it; drag it off the circuit to remove it.";
		grid.classList.toggle("is-placing", !!g);
	}
	grid.addEventListener("click", function (e) {
		var cn = e.target.closest(".qx-cn"); if (cn) { S.step = Math.min(+cn.dataset.col + 1, S.circ.cols.length); render(); return; }
		var ql = e.target.closest(".qx-ql"); if (ql) { S.bq = +ql.dataset.q; save(); render(); }
	});
	grid.addEventListener("keydown", function (e) {
		var hit = e.target.closest(".qx-hit"); if (!hit) return;
		if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sel = { ci: +hit.parentNode.dataset.ci, oi: +hit.parentNode.dataset.oi }; render(); var f = $("qx-edit").querySelector("input,select,button"); if (f) f.focus(); }
	});

	/* ---------------------------------------------------------------- gate editor */
	function drawEdit() {
		var box = $("qx-edit");
		if (!sel || !S.circ.cols[sel.ci] || !S.circ.cols[sel.ci][sel.oi]) { sel = null; box.hidden = true; box.innerHTML = ""; return; }
		var op = S.circ.cols[sel.ci][sel.oi], G = M.GATES[op.g], n = S.circ.n, h = '<div class="qx-eh"><b>' + esc(opName(op)) + "</b> <span>column " + (sel.ci + 1) + '</span><button type="button" class="qx-x" data-a="close" aria-label="Close">✕</button></div><div class="qx-er">';
		function sel1(role, i, v) { var s = '<label>' + role + ' <select data-role="' + (role === "Control" ? "c" : "q") + '" data-i="' + i + '">'; for (var q = 0; q < n; q++) s += '<option value="' + q + '"' + (q === v ? " selected" : "") + ">q" + q + "</option>"; return s + "</select></label>"; }
		op.q.forEach(function (q, i) { h += sel1(op.g === "SWAP" ? "Qubit" : op.g === "M" ? "Qubit" : "Target", i, q); });
		op.c.forEach(function (q, i) { h += sel1("Control", i, q) + '<button type="button" class="qx-b qx-b--s" data-a="rmc" data-i="' + i + '" title="Remove this control">− control</button>'; });
		if (G.par) h += '<label>Angle <input type="text" id="qx-ang" value="' + esc(M.fmtAngle(op.p)) + '" inputmode="text" spellcheck="false" aria-describedby="qx-angh"></label><span class="qx-angh" id="qx-angh">pi/4, 3π/8, 0.5 …</span>';
		if (op.g !== "M" && M.wires(op).length < n) h += '<button type="button" class="qx-b qx-b--s" data-a="addc">+ control</button>';
		h += '<button type="button" class="qx-b qx-b--s qx-b--del" data-a="del">Delete</button></div>';
		if (G.m && !op.c.length) { var m = G.m(op.p || 0); h += '<p class="qx-mat">Matrix: <code>[[' + M.fmtC(m[0], m[1]) + ", " + M.fmtC(m[2], m[3]) + "], [" + M.fmtC(m[4], m[5]) + ", " + M.fmtC(m[6], m[7]) + "]]</code></p>"; }
		box.innerHTML = h; box.hidden = false;
	}
	$("qx-edit").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"); if (!b || !sel) return;
		var col = S.circ.cols[sel.ci], op = col[sel.oi], a = b.dataset.a;
		if (a === "close") { sel = null; render(); return; }
		snapshot();
		if (a === "del") { col.splice(sel.oi, 1); sel = null; changed(); return; }
		var no = M.clean(op);
		if (a === "rmc") no.c.splice(+b.dataset.i, 1);
		if (a === "addc") { var used = M.wires(op), free = null, sp = M.span(op); for (var dq = 1; dq < S.circ.n && free == null; dq++) [sp[1] + dq, sp[0] - dq].forEach(function (q) { if (free == null && q >= 0 && q < S.circ.n && used.indexOf(q) < 0) free = q; }); no.c.push(free); }
		replaceSel(op, no);
	});
	$("qx-edit").addEventListener("change", function (e) {
		if (!sel) return;
		var col = S.circ.cols[sel.ci], op = col[sel.oi], no = M.clean(op), t = e.target;
		if (t.id === "qx-ang") {
			try { no.p = M.parseAngle(t.value); } catch (err) { toast(err.message); t.value = M.fmtAngle(op.p); return; }
			snapshot(); col[sel.oi] = no; sel = findOp(no); changed(true); return;
		}
		if (t.dataset.role) {
			var arr = t.dataset.role === "c" ? no.c : no.q, i = +t.dataset.i, v = +t.value, old = arr[i];
			// a wire chosen that is already used by this gate: swap the two roles
			var other = no.q.indexOf(v) >= 0 ? [no.q, no.q.indexOf(v)] : no.c.indexOf(v) >= 0 ? [no.c, no.c.indexOf(v)] : null;
			arr[i] = v; if (other && !(other[0] === arr && other[1] === i)) other[0][other[1]] = old;
			snapshot(); replaceSel(op, no);
		}
	});
	function replaceSel(op, no) {
		var col = S.circ.cols[sel.ci], ci = sel.ci;
		if (!M.validOp(no, S.circ.n)) { hist.pop(); toast("That would not be a valid gate."); return render(); }
		if (M.colFree(col, no, op)) col[col.indexOf(op)] = no;
		else { col.splice(col.indexOf(op), 1); S.circ.cols.splice(ci + 1, 0, [no]); }
		sel = findOp(no); changed(true); sel = findOp(no); render();
	}

	/* ---------------------------------------------------------------- state vector chart */
	function fitCanvas(cv, h) { var dpr = Math.min(2.5, window.devicePixelRatio || 1), w = Math.max(160, cv.parentNode.clientWidth); cv.style.height = h + "px"; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); var x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); return { x: x, w: w, h: h }; }
	var svBars = [];
	function drawState() {
		var cv = $("qx-sv"), s = res.state, n = s.n, N = 1 << n, list = [], i;
		for (i = 0; i < N; i++) { var p = s.re[i] * s.re[i] + s.im[i] * s.im[i]; if (!(S.hz || N > 64) || p > 1e-10) list.push(i); }
		var many = list.length > 256; if (many) list = list.filter(function (k) { return s.re[k] * s.re[k] + s.im[k] * s.im[k] > 1e-10; }).slice(0, 256);
		var labels = list.length <= 32, rot = labels && list.length > 8 && n > 2, H = labels ? (rot ? 230 : 210) : 190, C = fitCanvas(cv, H), x = C.x, fg = cvar("--qx-fg"), mut = cvar("--qx-mut"), gl = cvar("--qx-line");
		var L = 36, R = 8, T = 10, B = labels ? (rot ? 16 + n * 7.5 : 24) : 14, pw = C.w - L - R, ph = C.h - T - B;
		x.clearRect(0, 0, C.w, C.h); x.font = "11px system-ui, sans-serif"; x.fillStyle = mut; x.strokeStyle = gl; x.lineWidth = 1;
		var amp = S.mode === "amp";
		[0, 0.25, 0.5, 0.75, 1].forEach(function (v) { var y = T + ph - v * ph; x.beginPath(); x.moveTo(L, y + 0.5); x.lineTo(L + pw, y + 0.5); x.stroke(); x.textAlign = "right"; x.fillText(amp ? v.toFixed(2) : Math.round(v * 100) + "%", L - 5, y + 4); });
		var bw = pw / Math.max(1, list.length), gap = bw > 6 ? Math.min(4, bw * 0.18) : 0;
		svBars = [];
		list.forEach(function (k, j) {
			var re = s.re[k], im = s.im[k], p = re * re + im * im, a = Math.sqrt(p), v = amp ? a : p, hgt = v * ph, bx = L + j * bw + gap / 2;
			svBars.push({ k: k, x0: L + j * bw, x1: L + (j + 1) * bw });
			if (p > 1e-12) {
				x.fillStyle = amp ? "hsl(" + M.phaseHue(Math.atan2(im, re)) + ",78%," + (dark() ? "58%" : "48%") + ")" : cvar("--accent") || "#6d28d9";
				x.fillRect(bx, T + ph - hgt, Math.max(1, bw - gap), Math.max(1, hgt));
			}
			if (labels) {
				x.fillStyle = fg; var lab = "|" + M.key(k, n) + "⟩";
				if (rot) { x.save(); x.translate(L + j * bw + bw / 2 + 4, T + ph + 6); x.rotate(-PI / 2); x.textAlign = "right"; x.fillText(lab, 0, 0); x.restore(); }
				else { x.textAlign = "center"; x.fillText(lab, L + j * bw + bw / 2, T + ph + 16); }
			}
		});
		x.strokeStyle = mut; x.beginPath(); x.moveTo(L, T + ph + 0.5); x.lineTo(L + pw, T + ph + 0.5); x.stroke();
		$("qx-leg").innerHTML = (amp ? '<span class="qx-wheel" aria-hidden="true"></span> Bar height = size of the amplitude, colour = its phase: ' + legC() + '' : "Bar height = probability of reading that basis state") +
			(many ? " · showing the first 256 non-zero states" : N > 64 && !S.hz ? " · zero amplitudes hidden (" + N + " states)" : !labels ? " · " + list.length + " states (hover for details)" : "") + " · qubit order |" + (n > 1 ? "q" + (n - 1) + "…q0" : "q0") + "⟩";
		// table
		var rows = [], cnt = 0;
		for (i = 0; i < N && cnt < 256; i++) { var pp = s.re[i] * s.re[i] + s.im[i] * s.im[i]; if (pp < 1e-10) continue; cnt++; rows.push("<tr><td>|" + M.key(i, n) + "⟩</td><td>" + i + "</td><td>" + M.fmtC(s.re[i], s.im[i]) + "</td><td>" + (pp * 100).toFixed(2) + "%</td><td>" + Math.round(((Math.atan2(s.im[i], s.re[i]) * 180 / PI) + 360) % 360) + "°</td></tr>"); }
		$("qx-tbl").innerHTML = '<div class="qx-tw"><table><thead><tr><th>State</th><th>#</th><th>Amplitude</th><th>Probability</th><th>Phase</th></tr></thead><tbody>' + rows.join("") + "</tbody></table></div>" + (cnt >= 256 ? "<p>First 256 non-zero states.</p>" : "");
	}
	$("qx-sv").addEventListener("pointermove", function (e) {
		var r = this.getBoundingClientRect(), x = e.clientX - r.left, b = svBars.filter(function (q) { return x >= q.x0 && x < q.x1; })[0], tt = $("qx-tt");
		if (!b) { tt.hidden = true; return; }
		var s = res.state, re = s.re[b.k], im = s.im[b.k], p = re * re + im * im;
		tt.innerHTML = "<b>|" + M.key(b.k, s.n) + "⟩</b> (" + b.k + ")<br>amplitude " + M.fmtC(re, im) + "<br>probability " + (p * 100).toFixed(2) + "%<br>phase " + Math.round(((Math.atan2(im, re) * 180 / PI) + 360) % 360) + "°";
		tt.hidden = false; tt.style.left = Math.min(r.width - 150, Math.max(0, x + 10)) + "px"; tt.style.top = Math.max(0, e.clientY - r.top - 70) + "px";
	});
	$("qx-sv").addEventListener("pointerleave", function () { $("qx-tt").hidden = true; });

	/* ---------------------------------------------------------------- Bloch sphere */
	function drawBloch() {
		var n = S.circ.n, hq = "";
		for (var q = 0; q < n; q++) hq += '<button type="button" data-q="' + q + '" aria-pressed="' + (q === S.bq) + '">q' + q + "</button>";
		$("qx-bq").innerHTML = hq;
		var cv = $("qx-bl"), C = fitCanvas(cv, 280), x = C.x, b = M.bloch(res.state, S.bq), Rr = Math.min(C.w, C.h) * 0.36, cx = C.w / 2, cy = C.h / 2 + 4;
		var fg = cvar("--qx-fg"), mut = cvar("--qx-mut"), ln = cvar("--qx-line"), acc = cvar("--qx-arrow");
		var cyw = Math.cos(S.yaw), syw = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
		function P(X, Y, Z) { var x1 = X * cyw - Y * syw, y1 = X * syw + Y * cyw; return { x: cx + Rr * x1, y: cy - Rr * (y1 * sp + Z * cp), d: -y1 * cp + Z * sp }; }
		x.clearRect(0, 0, C.w, C.h);
		var g = x.createRadialGradient(cx - Rr * 0.35, cy - Rr * 0.4, Rr * 0.1, cx, cy, Rr);
		g.addColorStop(0, dark() ? "rgba(140,160,255,0.16)" : "rgba(120,140,255,0.10)"); g.addColorStop(1, dark() ? "rgba(140,160,255,0.04)" : "rgba(120,140,255,0.02)");
		x.fillStyle = g; x.beginPath(); x.arc(cx, cy, Rr, 0, 2 * PI); x.fill(); x.strokeStyle = mut; x.lineWidth = 1.2; x.stroke();
		function circle(f) { // great circle, front solid, back dashed
			var pts = []; for (var i = 0; i <= 96; i++) { var t = i / 96 * 2 * PI; pts.push(f(Math.cos(t), Math.sin(t))); }
			[true, false].forEach(function (front) {
				x.setLineDash(front ? [] : [3, 4]); x.strokeStyle = ln; x.lineWidth = front ? 1.1 : 0.9; x.beginPath(); var on = false;
				pts.forEach(function (p) { if ((p.d >= 0) === front) { if (!on) { x.moveTo(p.x, p.y); on = true; } else x.lineTo(p.x, p.y); } else on = false; });
				x.stroke();
			});
			x.setLineDash([]);
		}
		circle(function (c, s) { return P(c, s, 0); }); circle(function (c, s) { return P(c, 0, s); }); circle(function (c, s) { return P(0, c, s); });
		[[1, 0, 0, "|+⟩"], [-1, 0, 0, "|−⟩"], [0, 1, 0, "|+i⟩"], [0, -1, 0, "|−i⟩"], [0, 0, 1, "|0⟩"], [0, 0, -1, "|1⟩"]].forEach(function (a) {
			var p = P(a[0], a[1], a[2]), o = P(0, 0, 0), q2 = P(a[0] * 1.2, a[1] * 1.2, a[2] * 1.2);
			x.strokeStyle = ln; x.globalAlpha = p.d < 0 ? 0.45 : 1; x.beginPath(); x.moveTo(o.x, o.y); x.lineTo(p.x, p.y); x.stroke();
			x.fillStyle = a[2] ? fg : mut; x.font = (a[2] ? "bold 13px" : "12px") + " system-ui, sans-serif"; x.textAlign = "center"; x.fillText(a[3], q2.x, q2.y + 4); x.globalAlpha = 1;
		});
		var tip = P(b.x, b.y, b.z), foot = P(b.x, b.y, 0), o0 = P(0, 0, 0);
		x.setLineDash([3, 3]); x.strokeStyle = mut; x.beginPath(); x.moveTo(o0.x, o0.y); x.lineTo(foot.x, foot.y); x.lineTo(tip.x, tip.y); x.stroke(); x.setLineDash([]);
		if (b.r > 0.02) {
			x.strokeStyle = acc; x.lineWidth = 3; x.beginPath(); x.moveTo(o0.x, o0.y); x.lineTo(tip.x, tip.y); x.stroke();
			x.fillStyle = acc; x.beginPath(); x.arc(tip.x, tip.y, 6, 0, 2 * PI); x.fill();
		} else { x.fillStyle = acc; x.beginPath(); x.arc(o0.x, o0.y, 5, 0, 2 * PI); x.fill(); }
		x.fillStyle = mut; x.font = "11px system-ui, sans-serif"; x.textAlign = "left"; x.fillText("drag to turn", 8, C.h - 8);
		var an = M.blochAngles(b), ent = b.r < 0.999;
		$("qx-bv").innerHTML = '<span><b>q' + S.bq + "</b></span> <span>P(0) " + (b.p0 * 100).toFixed(1) + "%</span> <span>P(1) " + (b.p1 * 100).toFixed(1) + "%</span>" +
			(b.r > 0.02 ? " <span>θ " + Math.round(an.theta * 180 / PI) + "°</span> <span>φ " + Math.round(((an.phi * 180 / PI) + 360) % 360) + "°</span>" : "") + " <span>length " + b.r.toFixed(3) + "</span>" +
			(ent ? '<p class="qx-ent">⚠ q' + S.bq + " is <b>entangled</b> with other qubits" + (b.r < 0.02 ? " (fully)" : "") + ", so it has no pure state of its own. The arrow shows its reduced (mixed) state and is shorter than the sphere: length " + b.r.toFixed(2) + (b.r < 0.02 ? ", so it shrinks to the centre." : ".") + "</p>" : "");
	}
	$("qx-bq").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.bq = +b.dataset.q; save(); render(); });
	(function () {
		var cv = $("qx-bl"), st = null;
		cv.addEventListener("pointerdown", function (e) { st = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch }; cv.setPointerCapture(e.pointerId); });
		cv.addEventListener("pointermove", function (e) { if (!st) return; S.yaw = st.yaw - (e.clientX - st.x) * 0.012; S.pitch = Math.max(-1.45, Math.min(1.45, st.pitch + (e.clientY - st.y) * 0.012)); drawBloch(); });
		cv.addEventListener("pointerup", function () { st = null; }); cv.addEventListener("pointercancel", function () { st = null; });
		cv.addEventListener("keydown", function (e) { var d = { ArrowLeft: [0.15, 0], ArrowRight: [-0.15, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key]; if (!d) return; e.preventDefault(); S.yaw += d[0]; S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch + d[1])); drawBloch(); });
	})();

	/* ---------------------------------------------------------------- shots */
	function runShots() {
		S.seed = (S.seed * 1103515245 + 12345) >>> 0;
		var t0 = performance.now(); shotRes = M.shots(S.circ, S.sn, S.seed); shotRes.ms = performance.now() - t0; shotRes.n = S.sn; drawShots();
	}
	function drawShots() {
		var cv = $("qx-hist"), C = fitCanvas(cv, 220), x = C.x, fg = cvar("--qx-fg"), mut = cvar("--qx-mut"), gl = cvar("--qx-line");
		x.clearRect(0, 0, C.w, C.h);
		if (!shotRes) { x.fillStyle = mut; x.font = "13px system-ui, sans-serif"; x.textAlign = "center"; x.fillText("Press “Run shots” to measure the circuit many times.", C.w / 2, C.h / 2); $("qx-sinfo").textContent = ""; return; }
		var info = M.measureInfo(S.circ), qs = shotRes.qs, ideal = M.marginal(M.probs(M.run(S.circ).state), qs), keys = Object.keys(shotRes.counts);
		if (info.mid) ideal = null;
		// bars: every outcome that came up or that has a real chance, sorted; at most 64 (the most frequent)
		var all = {}; keys.forEach(function (k) { all[k] = 1; }); if (ideal) for (var i = 0; i < ideal.length; i++) if (ideal[i] > 1e-6) all[M.key(i, qs.length)] = 1;
		var list = Object.keys(all).sort(); if (list.length > 64) list = list.sort(function (a, b) { return (shotRes.counts[b] || 0) - (shotRes.counts[a] || 0); }).slice(0, 64).sort();
		var max = 0; list.forEach(function (k) { max = Math.max(max, (shotRes.counts[k] || 0) / shotRes.n, ideal ? ideal[parseInt(k, 2)] : 0); });
		max = Math.min(1, Math.max(0.05, max * 1.12));
		var labels = list.length <= 24, L = 40, R = 8, T = 10, B = labels ? (qs.length > 4 && list.length > 8 ? 14 + qs.length * 7.5 : 24) : 12, pw = C.w - L - R, ph = C.h - T - B;
		x.font = "11px system-ui, sans-serif"; x.strokeStyle = gl; x.fillStyle = mut;
		for (var g = 0; g <= 4; g++) { var v = max * g / 4, y = T + ph - ph * g / 4; x.beginPath(); x.moveTo(L, y + 0.5); x.lineTo(L + pw, y + 0.5); x.stroke(); x.textAlign = "right"; x.fillText(Math.round(v * 100) + "%", L - 5, y + 4); }
		var bw = pw / list.length, gap = bw > 6 ? Math.min(6, bw * 0.22) : 0, acc = cvar("--accent") || "#6d28d9";
		list.forEach(function (k, j) {
			var f = (shotRes.counts[k] || 0) / shotRes.n, h = f / max * ph, bx = L + j * bw + gap / 2;
			x.fillStyle = acc; x.fillRect(bx, T + ph - h, Math.max(1, bw - gap), h);
			if (ideal) { var iy = T + ph - ideal[parseInt(k, 2)] / max * ph; x.strokeStyle = fg; x.lineWidth = 2; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(bx, iy); x.lineTo(bx + Math.max(1, bw - gap), iy); x.stroke(); x.setLineDash([]); x.lineWidth = 1; }
			if (labels) {
				x.fillStyle = fg; var rot = qs.length > 4 && list.length > 8;
				if (rot) { x.save(); x.translate(L + j * bw + bw / 2 + 4, T + ph + 5); x.rotate(-PI / 2); x.textAlign = "right"; x.fillText(k, 0, 0); x.restore(); }
				else { x.textAlign = "center"; x.fillText(k, L + j * bw + bw / 2, T + ph + 16); }
				if (!rot && bw > 34 && shotRes.counts[k]) { x.fillStyle = mut; x.fillText(String(shotRes.counts[k]), L + j * bw + bw / 2, T + ph - h - 4); }
			}
		});
		var top = keys.sort(function (a, b) { return shotRes.counts[b] - shotRes.counts[a]; }).slice(0, 4).map(function (k) { return "<b>" + k + "</b> " + shotRes.counts[k]; });
		$("qx-sinfo").innerHTML = shotRes.n + " shots over " + (qs.length === S.circ.n && !info.qs.length ? "all qubits (no Measure gates)" : "q" + qs.slice().reverse().join(" q")) + ": " + top.join(" · ") + (list.length < Object.keys(all).length ? " …" : "") +
			(ideal ? ' · <span class="qx-dash"></span> = exact probability' : " · mid-circuit measurements: each shot simulated on its own") + " · " + Math.max(1, Math.round(shotRes.ms)) + " ms";
	}
	$("qx-run").addEventListener("click", runShots);
	$("qx-sn").addEventListener("change", function () { S.sn = +this.value; save(); if (shotRes) runShots(); });

	/* ---------------------------------------------------------------- play / step */
	function stopPlay() { clearInterval(playT); playT = 0; $("qx-playb").textContent = "▶ Play"; $("qx-playb").setAttribute("aria-label", "Play"); }
	function play() {
		if (playT) return stopPlay();
		if (stepNow() >= S.circ.cols.length) S.step = 0;
		$("qx-playb").textContent = "❚❚ Pause"; $("qx-playb").setAttribute("aria-label", "Pause");
		render();
		playT = setInterval(function () { var s = stepNow(); if (s >= S.circ.cols.length) { S.step = null; stopPlay(); render(); return; } S.step = s + 1; render(); }, 750);
	}
	function go(s) { stopPlay(); S.step = Math.max(0, Math.min(S.circ.cols.length, s)); if (S.step === S.circ.cols.length) S.step = null; render(); }
	$("qx-first").onclick = function () { go(0); }; $("qx-prev").onclick = function () { go(stepNow() - 1); };
	$("qx-next").onclick = function () { go(stepNow() + 1); }; $("qx-last").onclick = function () { go(S.circ.cols.length); };
	$("qx-playb").onclick = play;
	$("qx-step").addEventListener("input", function () { go(+this.value); });

	/* ---------------------------------------------------------------- toolbar */
	function setN(n) {
		n = Math.max(1, Math.min(M.MAXQ, n)); if (n === S.circ.n) return;
		snapshot();
		var lost = 0;
		if (n < S.circ.n) S.circ.cols = S.circ.cols.map(function (c) { return c.filter(function (o) { var keep = M.wires(o).every(function (w) { return w < n; }); if (!keep) lost++; return keep; }); });
		S.circ.n = n; if (S.bq >= n) S.bq = n - 1; sel = null;
		if (lost) toast(lost + " gate" + (lost > 1 ? "s" : "") + " on the removed qubit went too (Undo brings them back).");
		changed();
	}
	$("qx-qminus").onclick = function () { setN(S.circ.n - 1); }; $("qx-qplus").onclick = function () { setN(S.circ.n + 1); };
	$("qx-undo").onclick = undo; $("qx-redo").onclick = redo;
	$("qx-clear").onclick = function () { if (!S.circ.cols.length) return; snapshot(); S.circ = { n: S.circ.n, cols: [] }; sel = null; toast("Circuit cleared (Undo brings it back)."); changed(); };
	function link() { return location.origin + location.pathname + "?c=" + encodeURIComponent(M.encode(S.circ)).replace(/%2C/g, ",").replace(/%7E/g, "~").replace(/%2F/g, "/"); }
	function copy(t, ok) {
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast(ok); }, function () { fallback(); }); else fallback();
		function fallback() { var a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); toast(ok); } catch (e) { prompt("Copy this:", t); } a.remove(); }
	}
	$("qx-share").onclick = function () { copy(link(), "Link copied: it opens this exact circuit."); };
	[].forEach.call($("qx-mode").querySelectorAll("button"), function (b) { b.onclick = function () { S.mode = b.dataset.m; save(); render(); }; });
	$("qx-hz").onchange = function () { S.hz = this.checked; save(); render(); };

	/* ---------------------------------------------------------------- examples */
	function buildPre() {
		$("qx-pre").innerHTML = M.PRESETS.map(function (p) { return '<button type="button" data-ex="' + p.id + '" aria-pressed="' + (S.ex === p.id) + '">' + esc(p.name) + "</button>"; }).join("");
		var p = M.PRESETS.filter(function (x) { return x.id === S.ex; })[0];
		$("qx-note").textContent = p ? p.note : "Pick an example to load it, then step through it or change it.";
	}
	$("qx-pre").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		snapshot(); S.circ = M.preset(b.dataset.ex); S.ex = b.dataset.ex; sel = null; stopPlay(); S.bq = b.dataset.ex === "teleport" ? 2 : 0;
		S.circ = M.prune(S.circ); S.step = null; shotRes = null; save(); render(); runShots();
		var v = $("qx-view"); if (v.getBoundingClientRect().top < -40) v.scrollIntoView({ behavior: "smooth", block: "start" });
	});

	/* ---------------------------------------------------------------- QASM */
	function qerr(t) { $("qx-qerr").textContent = t || ""; }
	$("qx-qexp").onclick = function () { $("qx-qtxt").value = M.toQASM(S.circ); qerr(""); };
	$("qx-qimp").onclick = function () {
		try { var c = M.fromQASM($("qx-qtxt").value); snapshot(); S.circ = c; S.ex = ""; sel = null; if (S.bq >= c.n) S.bq = 0; changed(); qerr(""); toast("Loaded " + c.n + " qubits, " + M.ops(c).length + " gates."); }
		catch (e) { qerr("Could not load it: " + e.message); }
	};
	$("qx-qcopy").onclick = function () { if (!$("qx-qtxt").value.trim()) $("qx-qtxt").value = M.toQASM(S.circ); copy($("qx-qtxt").value, "OpenQASM copied."); };
	$("qx-qdl").onclick = function () { var t = $("qx-qtxt").value.trim() ? $("qx-qtxt").value : M.toQASM(S.circ), a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/plain" })); a.download = "circuit.qasm"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); };
	$("qx-qfile").onchange = function () { var f = this.files[0]; if (!f) return; f.text().then(function (t) { $("qx-qtxt").value = t; $("qx-qimp").click(); }); this.value = ""; };

	/* ---------------------------------------------------------------- keys */
	document.addEventListener("keydown", function (e) {
		var t = e.target, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable;
		if ((e.ctrlKey || e.metaKey) && !typing && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
		if ((e.ctrlKey || e.metaKey) && !typing && e.key === "y") { e.preventDefault(); redo(); return; }
		if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
		if (!root.contains(t) && t !== document.body) return;
		if (e.key === "Escape") { if (placing) setPlacing(null); else if (sel) { sel = null; render(); } return; }
		if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); snapshot(); S.circ.cols[sel.ci].splice(sel.oi, 1); sel = null; changed(); return; }
		if (t.id === "qx-bl") return;
		if (e.key === "ArrowRight") { e.preventDefault(); go(stepNow() + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(stepNow() - 1); }
		else if (e.key === "Home") { e.preventDefault(); go(0); } else if (e.key === "End") { e.preventDefault(); go(S.circ.cols.length); }
	});

	/* ---------------------------------------------------------------- render */
	function render() {
		res = M.run(S.circ, { upto: stepNow(), seed: S.seed });
		var n = S.circ.n, st = stepNow(), nc = S.circ.cols.length;
		$("qx-qnv").textContent = n + (n === 1 ? " qubit" : " qubits"); $("qx-qminus").disabled = n <= 1; $("qx-qplus").disabled = n >= M.MAXQ;
		$("qx-undo").disabled = !hist.length; $("qx-redo").disabled = !fut.length;
		$("qx-step").max = nc; $("qx-step").value = st;
		$("qx-stepv").textContent = nc ? (st >= nc ? "whole circuit (" + nc + " steps)" : st === 0 ? "start: all qubits |0⟩" : "after step " + st + " of " + nc) : "empty circuit";
		[].forEach.call($("qx-mode").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === S.mode)); });
		$("qx-hz").checked = S.hz;
		var mid = $("qx-mid");
		if (res.meas.length) { mid.hidden = false; mid.innerHTML = "Mid-circuit measurement in this run: " + res.meas.map(function (m) { return "q" + m.q + " → <b>" + m.v + "</b> (chance of 1 was " + (m.p1 * 100).toFixed(0) + "%)"; }).join(", ") + '. <button type="button" class="qx-b qx-b--s" id="qx-reroll">New random run</button>'; }
		else mid.hidden = true;
		drawCirc(); drawEdit(); drawState(); drawBloch(); drawShots(); buildPre();
	}
	document.addEventListener("click", function (e) { if (e.target.id === "qx-reroll") { S.seed = (S.seed * 69069 + 1) >>> 0; render(); } });
	var rt = 0; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { drawState(); drawBloch(); drawShots(); }, 80); });
	if (window.ResizeObserver) { var lastW = 0; new ResizeObserver(function (en) { var w = Math.round(en[0].contentRect.width); if (w !== lastW) { lastW = w; clearTimeout(rt); rt = setTimeout(function () { drawState(); drawBloch(); drawShots(); }, 60); } }).observe(root); }
	new MutationObserver(function () { drawState(); drawBloch(); drawShots(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

	buildPal(); load(); render();
	if (S.circ.cols.length) runShots();
	function panel() { if (window.MESPanel && !$("qx-view").__mesPanel) { window.MESPanel.add($("qx-view"), { bar: $("qx-vbtns"), onChange: function () { setTimeout(render, 40); } }); $("qx-view").__mesPanel = 1; } }
	if (window.MESPanel) panel(); else window.addEventListener("load", panel);
	window.MESQCDebug = { S: S, render: render, M: M, runShots: runShots, place: function (g, c, q) { dropPal(g, { c: c, q: q }); } };
})();
