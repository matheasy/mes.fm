/* MES Quantum Cryptography (#qc, mes.fm/quantum-cryptography) and the Quantum-Safe Website Checker (#qs, mes.fm/quantum-safe-check).
 * Maths in qlib.js (MESQC). Shares the cryptography page's script file; app.js only runs where #cg exists.
 * State: localStorage "mes-quantum-crypto:v1" (settings only). The checker calls /api/pq-check?u=<host>. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var Q = window.MESQC; if (!Q || (!$("qc") && !$("qs"))) return;
	var KEY = "mes-quantum-crypto:v1";
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	var S = Object.assign({ tab: "bb84", n: "1000", eve: 0, noise: 1, N: 15, a: 7, gq: 5, gm: 19, gk: 128, sf: "all", mx: 10, my: 5, mz: 12, kem: "768", dsa: "ml65" }, sget());
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function toast(t) { var el = document.querySelector(".tu-toast"); if (!el) { el = document.createElement("div"); el.className = "tu-toast"; document.body.appendChild(el); } el.textContent = t; el.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("tu-toast--show"); }, 1900); }
	function copy(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(msg || "Copied"); }, function () { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg || "Copied"); } catch (e) {} ta.remove(); }); }
	function seg(id, val, cb) { var el = $(id); function paint(v) { el.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === String(v)); }); } paint(val); el.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (b) { paint(b.dataset.v); cb(b.dataset.v); } }); }
	function stat(l, v, sub, cls) { return '<div class="tu-stat' + (cls ? " " + cls : "") + '"><span class="tu-stat__label">' + esc(l) + '</span><span class="tu-stat__value">' + esc(v) + "</span>" + (sub ? '<span class="tu-stat__sub">' + esc(sub) + "</span>" : "") + "</div>"; }
	function grp(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
	function pct(x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + "%"; }
	function sci(x) { if (x < 1e6) return grp(Math.round(x)); var m = x.toExponential(1).split("e+"); return m[0] + " × 10" + String(+m[1]).replace(/\d/g, function (d) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]; }); }
	function hex(b, n) { var s = ""; for (var i = 0; i < Math.min(b.length, n || b.length); i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16); return s; }

	/* ---------- "is my browser quantum-safe?" (shared by both pages) ---------- */
	function myBrowser(out) {
		out.innerHTML = '<p class="cg-wait">Asking Cloudflare…</p>';
		fetch("https://www.cloudflare.com/cdn-cgi/trace", { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
			var kv = {}; t.split("\n").forEach(function (l) { var i = l.indexOf("="); if (i > 0) kv[l.slice(0, i)] = l.slice(i + 1); });
			var kex = kv.kex || "", pq = /MLKEM|Kyber/i.test(kex);
			out.innerHTML = '<div class="tu-card cg-hero ' + (pq ? "cg-good" : "cg-bad") + '"><span class="cg-badge">' + (pq ? "Your browser is quantum-safe" : "Your browser is not using post-quantum encryption") + "</span><p>Key exchange: <b>" + esc(kex || "unknown") + "</b> · " + esc(kv.tls || "") + " · " + esc(kv.http || "") + "</p><p>" +
				(pq ? "Your browser agreed on the hybrid X25519 + ML-KEM key exchange, so sites that support it get post-quantum protection." : "Update your browser: Chrome, Edge, Brave, Opera and Firefox (recent versions) and Safari on iOS / macOS 26 use X25519MLKEM768. Some company networks and antivirus HTTPS scanners turn it off.") + "</p></div>";
		}).catch(function () { out.innerHTML = '<p class="cg-err">Could not reach Cloudflare (blocked by an extension or network?).</p>'; });
	}

	/* =================== Quantum-safe website checker =================== */
	if ($("qs")) (function () {
		var EX = ["mes.fm", "google.com", "cloudflare.com", "github.com", "amazon.com", "wikipedia.org", "apple.com", "microsoft.com", "hive.blog", "x.com", "facebook.com", "paypal.com"];
		$("qs-ex").insertAdjacentHTML("beforeend", EX.map(function (h) { return '<button type="button" class="tu-chip" data-h="' + h + '">' + h + "</button>"; }).join("") + '<button type="button" class="tu-chip" data-h="' + EX.slice(1, 9).join(" ") + '">Compare 8 big sites</button>');
		$("qs-ex").addEventListener("click", function (e) { var b = e.target.closest("[data-h]"); if (b) { $("qs-in").value = b.dataset.h.split(" ").join("\n"); run(); } });
		$("qs-go").onclick = run; $("qs-in").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !/\n/.test($("qs-in").value))) { e.preventDefault(); run(); } });
		$("qs-mine").onclick = function () { myBrowser($("qs-mybr")); };
		var results = [];
		function hosts(t) {
			var out = []; String(t).split(/[\s,]+/).forEach(function (w) { w = w.trim(); if (!w) return; var u; try { u = new URL(/^[a-z]+:\/\//i.test(w) ? w : "https://" + w); } catch (e) { return; } var h = u.hostname.toLowerCase().replace(/\.$/, ""); if (h && out.indexOf(h) < 0) out.push(h); });
			return out.slice(0, 10);
		}
		var local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
		var MOCK = { "mes.fm": [1, "RSA", 2048, "Let's Encrypt"], "google.com": [1, "ECDSA", 256, "Google Trust Services"], "cloudflare.com": [1, "ECDSA", 256, "Google Trust Services"], "apple.com": [1, "RSA", 2048, "Apple"], "microsoft.com": [1, "RSA", 2048, "Microsoft"], "hive.blog": [1, "ECDSA", 256, "Let's Encrypt"], "github.com": [0, "ECDSA", 256, "Sectigo"], "amazon.com": [0, "RSA", 2048, "DigiCert"], "wikipedia.org": [0, "ECDSA", 256, "Let's Encrypt"] };
		function check(h) {
			if (local) { var m = MOCK[h] || [h.length % 2, "RSA", 2048, "Example CA"]; var r = { host: h, https: true, pq: !!m[0], draft: false, kx: m[0] ? "X25519MLKEM768" : "X25519", tls: "TLSv1.3", cipher: "TLS_AES_128_GCM_SHA256", cert: { type: m[1], bits: m[1] === "RSA" ? m[2] : null, curve: m[1] === "ECDSA" ? "prime256v1" : null, issuer: m[3], validTo: "Feb 4 2027" }, certValid: true, ms: 120, mock: true };
				r.grade = r.pq ? "A" : "C"; r.label = r.pq ? "Quantum-safe key exchange" : "Not quantum-safe yet"; r.summary = "Sample answer (local preview: the real check runs on mes.fm)."; return new Promise(function (ok) { setTimeout(function () { ok(r); }, 250); }); }
			return fetch("/api/pq-check?u=" + encodeURIComponent(h)).then(function (r) { return r.json().catch(function () { return { error: "The checker answered " + r.status + "." }; }); }, function () { return { error: "Could not reach the checker." }; }).then(function (j) { j.host = j.host || h; return j; });
		}
		function certText(c) { if (!c || !c.type) return "–"; return c.type + (c.bits ? " " + c.bits : "") + (c.curve ? " " + c.curve.replace("prime256v1", "P-256").replace("secp384r1", "P-384") : ""); }
		function row(r) {
			if (r.error) return '<div class="tu-card qs-res"><div class="qs-top"><span class="qs-g qs-gX">?</span><div><h3 class="qs-host">' + esc(r.host) + '</h3><p class="cg-err">' + esc(r.error) + "</p></div></div></div>";
			return '<div class="tu-card qs-res"><div class="qs-top"><span class="qs-g qs-g' + esc(r.grade) + '">' + esc(r.grade) + '</span><div><h3 class="qs-host">' + esc(r.host) + '</h3><p class="qs-label">' + esc(r.label) + "</p></div></div>" +
				'<p class="qs-sum">' + esc(r.summary) + "</p><dl class=\"qs-dl\"><div><dt>Key exchange</dt><dd>" + esc(r.kx || "–") + (r.pq ? " ✓" : "") + "</dd></div><div><dt>TLS</dt><dd>" + esc(r.tls || "–") + "</dd></div><div><dt>Cipher</dt><dd>" + esc(r.cipher || "–") + "</dd></div>" +
				"<div><dt>Certificate</dt><dd>" + esc(certText(r.cert)) + (r.cert && r.cert.issuer ? " · " + esc(r.cert.issuer) : "") + ' <small>(classical, as on every site today)</small></dd></div>' + (r.cert && r.cert.validTo ? "<div><dt>Valid until</dt><dd>" + esc(r.cert.validTo) + "</dd></div>" : "") +
				(r.certValid === false ? '<div><dt>Warning</dt><dd class="cg-err">Certificate problem: ' + esc(r.certError || "not trusted") + "</dd></div>" : "") + "</dl>" +
				(r.redirectHost ? '<p class="cg-note">This address redirects to <b>' + esc(r.redirectHost) + '</b>. <button type="button" class="tu-btn tu-btn--ghost qs-also" data-h="' + esc(r.redirectHost) + '">Check ' + esc(r.redirectHost) + " too</button></p>" : "") +
				(r.httpsInLink === false ? '<p class="cg-note">Your link starts with http://, which is not encrypted at all; the check above is for the https:// version.</p>' : "") + "</div>";
		}
		$("qs-out").addEventListener("click", function (e) { var b = e.target.closest(".qs-also"); if (b) { $("qs-in").value += "\n" + b.dataset.h; run(); } });
		function run() {
			var hs = hosts($("qs-in").value), err = $("qs-err"); if (!hs.length) { err.textContent = "Type a website address, like example.com."; err.hidden = false; return; } err.hidden = true;
			results = new Array(hs.length); var out = $("qs-out"); out.innerHTML = hs.map(function (h, i) { return '<div class="tu-card qs-res" id="qs-r' + i + '"><div class="qs-top"><span class="qs-g qs-gX qs-spin">…</span><div><h3 class="qs-host">' + esc(h) + '</h3><p class="qs-label">Checking…</p></div></div></div>'; }).join("");
			history.replaceState(null, "", location.pathname + "?u=" + hs.map(encodeURIComponent).join(","));
			var next = 0, active = 0;
			function pump() { while (active < 3 && next < hs.length) (function (i) { active++; check(hs[i]).then(function (r) { results[i] = r; var el = $("qs-r" + i); if (el) el.outerHTML = row(r).replace('class="tu-card qs-res"', 'class="tu-card qs-res" id="qs-r' + i + '"'); active--; pump(); summary(); }); })(next++); }
			pump();
		}
		function summary() {
			var done = results.filter(Boolean); $("qs-acts").hidden = !done.length; if (done.length < 2 || done.length < results.length) return;
			var ok = done.filter(function (r) { return r.pq; }).length; toast(ok + " of " + done.length + " sites are quantum-safe");
		}
		function rows() { return results.filter(Boolean).map(function (r) { return [r.host, r.grade || "?", r.label || r.error, r.kx || "", r.tls || "", certText(r.cert)]; }); }
		$("qs-link").onclick = function () { copy(location.href, "Link copied"); };
		$("qs-csv").onclick = function () { copy([["Site", "Grade", "Result", "Key exchange", "TLS", "Certificate"]].concat(rows()).map(function (r) { return r.join("\t"); }).join("\n"), "Copied: paste into a spreadsheet"); };
		$("qs-md").onclick = function () { var rr = rows(); copy("| Site | Grade | Result | Key exchange | TLS |\n|---|---|---|---|---|\n" + rr.map(function (r) { return "| " + r.slice(0, 5).join(" | ") + " |"; }).join("\n"), "Markdown copied"); };
		var qu = new URLSearchParams(location.search).get("u"); if (qu) { $("qs-in").value = qu.split(",").slice(0, 10).join("\n"); run(); }
	})();

	/* =================== Quantum cryptography page =================== */
	if (!$("qc")) return;
	var TABS = ["bb84", "shor", "grover", "safe", "pqc"], inited = {}, INIT = { bb84: initBB, shor: initShor, grover: initGrover, safe: initSafe, pqc: initPqc };
	var qp = new URLSearchParams(location.search); if (qp.get("tab")) S.tab = qp.get("tab");
	function showTab(t, push) {
		if (TABS.indexOf(t) < 0) t = "bb84"; S.tab = t; save();
		document.querySelectorAll("#qc-tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.t === t); b.tabIndex = b.dataset.t === t ? 0 : -1; });
		document.querySelectorAll("#qc .cg-pane").forEach(function (p) { p.hidden = p.dataset.pane !== t; });
		if (!inited[t]) { inited[t] = 1; INIT[t](); }
		if (push) history.replaceState(null, "", location.pathname + (t === "bb84" ? "" : "?tab=" + t));
	}
	$("qc-tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) showTab(b.dataset.t, true); });
	$("qc-tabs").addEventListener("keydown", function (e) { var i = TABS.indexOf(S.tab), j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -9; if (j === -9) return; e.preventDefault(); j = (j + TABS.length) % TABS.length; showTab(TABS[j], true); document.querySelector('#qc-tabs [data-t="' + TABS[j] + '"]').focus(); });

	/* ---------- BB84 ---------- */
	var GLY = [["↔", "↕"], ["⤢", "⤡"]], BAS = ["+", "×"];
	function initBB() {
		$("qc-n").value = S.n; $("qc-eve").value = S.eve; $("qc-noise").value = S.noise;
		["qc-n", "qc-eve", "qc-noise"].forEach(function (id) { $(id).addEventListener("input", runBB); }); $("qc-send").onclick = function () { runBB(true); };
		runBB();
	}
	var seed = 12345;
	function runBB(fresh) {
		if (fresh === true) seed = (Math.random() * 1e9) | 0;
		S.n = $("qc-n").value; S.eve = +$("qc-eve").value; S.noise = +$("qc-noise").value; save();
		$("qc-evev").textContent = S.eve + "%"; $("qc-noisev").textContent = S.noise + "%";
		var r = Q.bb84(+S.n, { eve: S.eve / 100, noise: S.noise / 100, seed: seed });
		$("qc-bstats").innerHTML = stat("Photons sent", grp(+S.n)) + stat("Kept (same basis)", grp(r.sifted), "about half") + stat("Errors in the sample", r.sample ? grp(r.sampleErrors) + " of " + grp(r.sample) : "–", "error rate " + pct(r.qest)) + stat("Secret key left", r.abort ? "0 bits" : grp(r.final) + " bits", r.abort ? "thrown away" : "after privacy amplification");
		$("qc-bverdict").innerHTML = '<div class="cg-hero ' + (r.abort ? "cg-bad" : "cg-good") + '"><span class="cg-badge">' + (r.abort ? "Eavesdropper detected" : r.qest > 0 ? "Safe, after shrinking the key" : "Perfect channel") + "</span><p>" +
			(r.abort ? "The sample shows " + pct(r.qest) + " errors, above the 11% limit. Alice and Bob know someone (or a very bad fibre) disturbed the photons, so they discard the key and try again." : r.qest > 0 ? pct(r.qest) + " errors is below 11%: they correct the errors and shrink the key to " + pct(r.keyRate, 0) + " of its size, which removes anything Eve could know." : "No errors: Alice's and Bob's keys match exactly and nobody listened.") +
			(S.eve > 0 && !r.abort ? " Eve listened to " + S.eve + "% of photons but learns nothing usable after privacy amplification." : "") + "</p>" + keyLine(r) + "</div>";
		drawPhotons(r.photons.slice(0, 24)); drawBBChart(r.qber);
	}
	function keyLine(r) {
		if (!r.aliceKey) return ""; var a = r.aliceKey.slice(0, 64), b = r.bobKey.slice(0, 64), h = "";
		for (var i = 0; i < a.length; i++) h += a[i] === b[i] ? a[i] : '<mark class="qc-x">' + b[i] + "</mark>";
		return '<p class="qc-keys"><span>Alice</span><code>' + a + '</code><br><span>Bob</span><code>' + h + "</code></p>";
	}
	function drawPhotons(ph) {
		var rows = [["Photon", function (p) { return p.i + 1; }], ["Alice's bit", function (p) { return p.a; }], ["Alice's basis", function (p) { return BAS[p.ab]; }], ["Photon sent", function (p) { return '<span class="qc-gl">' + GLY[p.ab][p.a] + "</span>"; }],
			["Eve", function (p) { return p.eb < 0 ? "" : '<span title="Eve measured in ' + BAS[p.eb] + '">👁︎' + BAS[p.eb] + "</span>"; }], ["Bob's basis", function (p) { return BAS[p.bb]; }], ["Bob's bit", function (p) { return p.b; }], ["Keep?", function (p) { return p.keep ? "✓" : ""; }]];
		$("qc-ptab").innerHTML = "<tbody>" + rows.map(function (r) { return "<tr><th>" + r[0] + "</th>" + ph.map(function (p) { return '<td class="' + (p.err ? "is-err" : p.keep ? "is-keep" : "") + '">' + r[1](p) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody>";
	}
	function drawBBChart(cur) {
		var W = 620, H = 210, L = 44, B = 30, Y = function (v) { return H - B - v / 0.3 * (H - B - 12); }, X = function (f) { return L + f * (W - L - 12); }, s = '<svg viewBox="0 0 ' + W + " " + H + '" class="cg-svg" role="img" aria-label="Error rate against eavesdropping">';
		for (var v = 0; v <= 0.3; v += 0.05) s += '<line x1="' + L + '" x2="' + (W - 12) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="cg-grid"/><text x="' + (L - 5) + '" y="' + (Y(v) + 4) + '" class="cg-axis" text-anchor="end">' + Math.round(v * 100) + "%</text>";
		for (var f = 0; f <= 1.001; f += 0.25) s += '<text x="' + X(f) + '" y="' + (H - 10) + '" class="cg-axis" text-anchor="middle">' + Math.round(f * 100) + "%</text>";
		s += '<line x1="' + L + '" x2="' + (W - 12) + '" y1="' + Y(0.11) + '" y2="' + Y(0.11) + '" class="qc-limit"/><text x="' + (W - 14) + '" y="' + (Y(0.11) - 5) + '" class="cg-axis" text-anchor="end">11% limit</text>';
		var d = ""; for (var k = 0; k <= 50; k++) { var ff = k / 50; d += (k ? "L" : "M") + X(ff).toFixed(1) + " " + Y(Q.expectedQber(ff, S.noise / 100)).toFixed(1); }
		s += '<path d="' + d + '" class="qc-line"/><circle cx="' + X(S.eve / 100) + '" cy="' + Y(Math.min(cur, 0.3)) + '" r="6" class="qc-dot"/><text x="' + (L + (W - L) / 2) + '" y="' + (H - 0) + '" class="cg-axis" text-anchor="middle"></text></svg>';
		$("qc-bchart").innerHTML = s + '<p class="cg-note qc-cap">Across: how many photons Eve measures. Up: errors on the kept photons. Dot: this run.</p>';
	}

	/* ---------- Shor ---------- */
	var SH = null;
	function initShor() {
		$("qc-N").value = S.N; $("qc-a").value = S.a;
		var EX = [[15, 7], [21, 2], [35, 3], [33, 5], [91, 3], [143, 2], [221, 2], [247, 5]];
		$("qc-shex").insertAdjacentHTML("beforeend", EX.map(function (x) { return '<button type="button" class="tu-chip" data-n="' + x[0] + '" data-a="' + x[1] + '">' + x[0] + "</button>"; }).join(""));
		$("qc-shex").addEventListener("click", function (e) { var b = e.target.closest("[data-n]"); if (b) { $("qc-N").value = b.dataset.n; $("qc-a").value = b.dataset.a; runShor(); } });
		["qc-N", "qc-a"].forEach(function (id) { $(id).addEventListener("input", runShor); });
		$("qc-arand").onclick = function () { var N = +$("qc-N").value; if (N > 3) { var a; do { a = 2 + Math.floor(Math.random() * (N - 3)); } while (Q.gcd(a, N) !== 1 && Math.random() < 0.9); $("qc-a").value = a; runShor(); } };
		$("qc-measure").onclick = function () { measure(1); }; $("qc-measure10").onclick = function () { measure(10); };
		runShor();
	}
	function shErr(m) { var e = $("qc-sherr"); e.textContent = m || ""; e.hidden = !m; }
	function runShor() {
		var N = Math.round(+$("qc-N").value), a = Math.round(+$("qc-a").value); $("qc-meas").innerHTML = "";
		SH = null; ["qc-shout", "qc-shseq", "qc-shdist", "qc-shsteps"].forEach(function (id) { $(id).innerHTML = ""; }); $("qc-shqnote").textContent = "";
		if (!(N >= 4 && N <= Q.SHOR_MAX)) return shErr("Pick N between 4 and " + Q.SHOR_MAX + " (a bigger N needs more qubits than a browser can simulate).");
		if (Q.isPrimeSmall(N)) return shErr(N + " is prime, so there is nothing to factor.");
		if (N % 2 === 0) return shErr(N + " is even: 2 is a factor (" + N + " = 2 × " + N / 2 + "). Shor's algorithm is for odd numbers. Try 15, 21 or 35.");
		if (Q.isPrimePower(N)) return shErr(N + " is a power of one prime; that is found with a quick classical check, so Shor's algorithm skips it. Try 15, 21 or 35.");
		if (!(a >= 2 && a < N)) return shErr("Pick a between 2 and " + (N - 1) + ".");
		shErr(); S.N = N; S.a = a; save();
		var f = Q.shorFactor(N, a);
		$("qc-shsteps").innerHTML = f.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + (f.ok ? '<li class="qc-ok"><b>' + N + " = " + f.p + " × " + f.q + "</b> ✓</li>" : "");
		if (f.trivial) { $("qc-shout").innerHTML = '<p class="cg-status">' + esc(f.steps[0]) + " No quantum computer needed this time; try another a.</p>"; return; }
		var d = Q.shorDist(a, N); SH = { N: N, a: a, d: d, f: f, runs: [] };
		$("qc-shout").innerHTML = '<div class="tu-stats cg-mini">' + stat("Qubits in the input register", d.q, "Q = 2^" + d.q + " = " + grp(d.Q) + " ≥ N²") + stat("Period r", d.r, a + "^" + d.r + " mod " + N + " = 1") + stat("Result", f.ok ? f.p + " × " + f.q : "this a fails", f.ok ? "" : "pick another a") + "</div>";
		var xs = Math.min(Math.max(3 * d.r + 1, 16), 64), vals = []; for (var x = 0; x < xs; x++) vals.push(Q.modpow(a, x, N));
		var W = 620, H = 190, L = 34, B = 26, bw = (W - L - 6) / xs, s = '<svg viewBox="0 0 ' + W + " " + H + '" class="cg-svg" role="img" aria-label="a to the x mod N">';
		for (x = 0; x < xs; x++) { var h = vals[x] / N * (H - B - 12); s += '<rect x="' + (L + x * bw + 1).toFixed(1) + '" y="' + (H - B - h).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" class="cg-bar' + (x % d.r === 0 ? " is-pick" : "") + '"><title>' + a + "^" + x + " mod " + N + " = " + vals[x] + "</title></rect>"; if (xs <= 32 || x % 4 === 0) s += '<text x="' + (L + x * bw + bw / 2).toFixed(1) + '" y="' + (H - 9) + '" class="cg-axis" text-anchor="middle">' + x + "</text>"; }
		s += '<text x="' + (L - 4) + '" y="16" class="cg-axis" text-anchor="end">' + N + '</text></svg><p class="cg-note qc-cap">x across, ' + a + "ˣ mod " + N + " up. Orange bars are where the value is 1: the pattern repeats every <b>" + d.r + "</b>. A normal computer has to try x one by one; for a 2048-bit N that takes longer than the universe has existed.</p>";
		$("qc-shseq").innerHTML = s;
		$("qc-shqnote").innerHTML = "After the quantum Fourier transform, the " + d.q + "-qubit register only gives values near multiples of Q / r = " + grp(d.Q) + " / " + d.r + " ≈ " + (d.Q / d.r).toFixed(1) + ". Each spike is one possible measurement; its height is the probability.";
		drawDist();
	}
	function drawDist() {
		var d = SH.d, W = 620, H = 200, L = 40, B = 26, cols = W - L - 8, mx = 0, agg = new Float64Array(cols);
		for (var y = 0; y < d.Q; y++) { var c = Math.floor(y / d.Q * cols); if (d.P[y] > agg[c]) agg[c] = d.P[y]; if (d.P[y] > mx) mx = d.P[y]; }
		var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="cg-svg" role="img" aria-label="Measurement probabilities">';
		for (var i = 0; i < cols; i++) if (agg[i] > mx * 0.002) { var h = agg[i] / mx * (H - B - 14); s += '<rect x="' + (L + i) + '" y="' + (H - B - h).toFixed(1) + '" width="1.2" height="' + h.toFixed(1) + '" class="qc-spike"/>'; }
		SH.runs.forEach(function (rn) { var xx = L + rn.y / d.Q * cols; s += '<line x1="' + xx + '" x2="' + xx + '" y1="10" y2="' + (H - B) + '" class="qc-meas"/>'; });
		for (var k = 0; k <= 4; k++) s += '<text x="' + (L + k / 4 * cols) + '" y="' + (H - 9) + '" class="cg-axis" text-anchor="middle">' + grp(Math.round(k / 4 * d.Q)) + "</text>";
		s += '<text x="' + (L - 4) + '" y="18" class="cg-axis" text-anchor="end">' + pct(mx, 0) + "</text></svg>";
		$("qc-shdist").innerHTML = s;
	}
	function measure(times) {
		if (!SH) return; var rnd = Math.random, html = "";
		for (var t = 0; t < times; t++) {
			var y = Q.sample(SH.d.P, rnd), pf = Q.periodFrom(y, SH.d.Q, SH.a, SH.N); SH.runs.push({ y: y, r: pf.r }); if (SH.runs.length > 40) SH.runs.shift();
		}
		var good = SH.runs.filter(function (r) { return r.r === SH.d.r; }).length;
		html = '<div class="tu-table-wrap"><table class="tu-table cg-tab"><thead><tr><th>Measured y</th><th>y / Q as a fraction</th><th>Period found</th></tr></thead><tbody>' + SH.runs.slice(-10).reverse().map(function (rn) {
			var c = Q.convergents(rn.y, SH.d.Q), best = c.filter(function (x) { return x[1] <= SH.N; }).pop() || [0, 1];
			return "<tr><td>" + grp(rn.y) + "</td><td>" + grp(rn.y) + " / " + grp(SH.d.Q) + " ≈ " + best[0] + " / " + best[1] + "</td><td>" + (rn.r === SH.d.r ? "<b>r = " + rn.r + "</b> ✓" : rn.r ? "r = " + rn.r + " (a factor of the true period: combine runs)" : "y = 0 or no luck: run again") + "</td></tr>";
		}).join("") + '</tbody></table></div><p class="cg-note">' + good + " of " + SH.runs.length + " runs gave the period directly. The fraction y / Q is turned into p / r with <b>continued fractions</b>; a quantum computer only needs a few runs.</p>";
		$("qc-meas").innerHTML = html; drawDist();
	}

	/* ---------- Grover ---------- */
	var GK = 0;
	function initGrover() {
		$("qc-gq").value = S.gq; $("qc-gm").value = S.gm; $("qc-gk").value = S.gk;
		$("qc-gq").addEventListener("input", function () { GK = 0; runGrover(); }); $("qc-gm").addEventListener("input", function () { GK = 0; runGrover(); });
		$("qc-gstep").onclick = function () { GK++; runGrover(); }; $("qc-gback").onclick = function () { GK = Math.max(0, GK - 1); runGrover(); };
		$("qc-gbest").onclick = function () { GK = Q.groverIters(1 << S.gq, 1); runGrover(); }; $("qc-greset").onclick = function () { GK = 0; runGrover(); };
		$("qc-gk").addEventListener("input", runKeys); runGrover(); runKeys();
	}
	function runGrover() {
		S.gq = +$("qc-gq").value; var Nn = 1 << S.gq; $("qc-gqv").textContent = S.gq; var m = Math.round(+$("qc-gm").value); if (!(m >= 0 && m < Nn)) { m = Nn - 1; $("qc-gm").value = m; } S.gm = m; save();
		var amp = Q.groverState(S.gq, [m], GK), p = amp[m] * amp[m], best = Q.groverIters(Nn, 1);
		$("qc-gstat").innerHTML = "<b>" + Nn + " items</b> (" + S.gq + " qubits) · step <b>" + GK + "</b> · chance of measuring the answer: <b>" + pct(p) + "</b> · best after " + best + " steps (a normal search needs " + Nn / 2 + " tries on average)" + (GK > best ? ' · <span class="cg-err">too far: the answer is shrinking again</span>' : "");
		var W = 620, H = 200, mid = 100, L = 8, bw = (W - 2 * L) / Nn, s = '<svg viewBox="0 0 ' + W + " " + H + '" class="cg-svg" role="img" aria-label="Amplitudes">';
		s += '<line x1="' + L + '" x2="' + (W - L) + '" y1="' + mid + '" y2="' + mid + '" class="cg-grid"/>';
		for (var i = 0; i < Nn; i++) { var h = amp[i] * (mid - 8); s += '<rect x="' + (L + i * bw).toFixed(2) + '" y="' + (h >= 0 ? mid - h : mid).toFixed(1) + '" width="' + Math.max(0.6, bw - (bw > 4 ? 1 : 0)).toFixed(2) + '" height="' + Math.abs(h).toFixed(1) + '" class="' + (i === m ? "qc-ans" : "cg-bar") + '"><title>Item ' + i + ": amplitude " + amp[i].toFixed(3) + "</title></rect>"; }
		s += "</svg>"; $("qc-gbars").innerHTML = s + '<p class="cg-note qc-cap">One bar per item: its amplitude (probability = amplitude²). The red bar is the answer.</p>';
		var K = Math.max(best * 2 + 2, 6), W2 = 620, H2 = 140, s2 = '<svg viewBox="0 0 ' + W2 + " " + H2 + '" class="cg-svg" role="img" aria-label="Success chance per step">', d = "";
		for (var k = 0; k <= K; k++) d += (k ? "L" : "M") + (30 + k / K * (W2 - 40)).toFixed(1) + " " + (H2 - 20 - Q.groverSuccess(Nn, 1, k) * (H2 - 30)).toFixed(1);
		s2 += '<path d="' + d + '" class="qc-line"/><circle cx="' + (30 + Math.min(GK, K) / K * (W2 - 40)) + '" cy="' + (H2 - 20 - p * (H2 - 30)) + '" r="6" class="qc-dot"/><text x="26" y="14" class="cg-axis" text-anchor="end">100%</text><text x="' + (W2 - 10) + '" y="' + (H2 - 4) + '" class="cg-axis" text-anchor="end">steps →</text></svg>';
		$("qc-gcurve").innerHTML = s2;
	}
	function runKeys() {
		S.gk = +$("qc-gk").value; save(); $("qc-gkv").textContent = S.gk; var k = S.gk, cl = Math.pow(2, k - 1), qu = Math.PI / 4 * Math.pow(2, k / 2), yr = 31557600;
		$("qc-gkout").innerHTML = '<div class="tu-stats cg-mini">' + stat("Normal computer", sci(cl) + " tries", "on average; at 10¹² a second: " + sci(cl / 1e12 / yr) + " years") + stat("Quantum computer (Grover)", sci(qu) + " steps", "one after another; at 10⁹ a second: " + sci(qu / 1e9 / yr) + " years") + stat("Strength left", Math.round(k / 2) + " bits", k / 2 >= 128 ? "safe" : k / 2 >= 80 ? "still very hard" : "breakable", k / 2 >= 100 ? "" : "") + "</div><p class=\"cg-note\">Grover's steps can't be split across many machines nearly as well as normal guessing can, so the real speed-up is even smaller. That's why AES-256 is called quantum-safe.</p>";
	}

	/* ---------- Quantum-safe table, Mosca, costs ---------- */
	var STL = { broken: ["Broken by Shor", "qc-st-broken"], weakened: ["Weakened by Grover", "qc-st-weak"], safe: ["Quantum-safe", "qc-st-safe"], pq: ["Post-quantum standard", "qc-st-pq"] };
	function initSafe() {
		seg("qc-sf", S.sf, function (v) { S.sf = v; save(); drawSafe(); }); drawSafe();
		$("qc-mx").value = S.mx; $("qc-my").value = S.my; $("qc-mz").value = S.mz; ["qc-mx", "qc-my", "qc-mz"].forEach(function (id) { $(id).addEventListener("input", runMosca); });
		var EX = [["Chat messages", 2, 3], ["Bank records", 7, 5], ["Medical records", 25, 5], ["Bitcoin / Hive keys", 30, 5], ["Government secrets", 50, 10]];
		$("qc-mex").insertAdjacentHTML("beforeend", EX.map(function (x) { return '<button type="button" class="tu-chip" data-x="' + x[1] + '" data-y="' + x[2] + '">' + x[0] + "</button>"; }).join(""));
		$("qc-mex").addEventListener("click", function (e) { var b = e.target.closest("[data-x]"); if (b) { $("qc-mx").value = b.dataset.x; $("qc-my").value = b.dataset.y; runMosca(); } });
		runMosca();
		$("qc-cost").innerHTML = "<thead><tr><th>Attack</th><th>Quantum computer needed</th><th>Time</th><th>Source</th></tr></thead><tbody>" + Q.SHOR_COST.map(function (c) { return "<tr><td>" + esc(c.what) + "</td><td>" + esc(c.qubits) + "</td><td>" + esc(c.time || "–") + "</td><td>" + esc(c.src) + "</td></tr>"; }).join("") + "</tbody>";
		$("qc-chk").addEventListener("submit", function (e) { e.preventDefault(); var v = $("qc-chku").value.trim(); location.href = "/quantum-safe-check" + (v ? "?u=" + encodeURIComponent(v) : ""); });
	}
	function drawSafe() {
		var list = Q.ALGOS.filter(function (a) { return S.sf === "all" || a.st === S.sf || (S.sf === "safe" && a.st === "pq"); });
		$("qc-stab").innerHTML = "<thead><tr><th>Algorithm</th><th>Used for</th><th>Status</th><th>Security today</th><th>Against a quantum computer</th><th>Key / output size</th><th>Where you meet it</th></tr></thead><tbody>" + list.map(function (a) {
			return "<tr><td><b>" + esc(a.name) + "</b></td><td>" + esc(a.use) + '</td><td><span class="qc-st ' + STL[a.st][1] + '">' + STL[a.st][0] + "</span><br><small>" + esc(a.why) + "</small></td><td>" + a.cls + " bits</td><td>" + (a.qs ? a.qs + " bits" : "<b>0</b> (broken)") + "</td><td>" + (a.pk ? Q.bytesLabel(a.pk) : "–") + " / " + Q.bytesLabel(a.out) + "</td><td>" + esc(a.where) + "</td></tr>";
		}).join("") + "</tbody>";
	}
	function runMosca() {
		S.mx = +$("qc-mx").value; S.my = +$("qc-my").value; S.mz = +$("qc-mz").value; save();
		$("qc-mxv").textContent = S.mx; $("qc-myv").textContent = S.my; $("qc-mzv").textContent = S.mz;
		var m = Q.mosca(S.mx, S.my, S.mz), max = Math.max(S.mx + S.my, S.mz, 10) * 1.1, W = 620, X = function (v) { return 110 + v / max * (W - 130); }, now = new Date().getFullYear();
		var s = '<svg viewBox="0 0 ' + W + ' 130" class="cg-svg" role="img" aria-label="Mosca timeline">' +
			'<text x="104" y="40" class="cg-axis" text-anchor="end">Your data</text><rect x="110" y="24" width="' + (X(S.my) - 110) + '" height="24" class="qc-my"/><rect x="' + X(S.my) + '" y="24" width="' + (X(S.my + S.mx) - X(S.my)) + '" height="24" class="qc-mx2"/>' +
			'<text x="104" y="88" class="cg-axis" text-anchor="end">Quantum</text><rect x="110" y="72" width="' + (X(S.mz) - 110) + '" height="24" class="qc-mz"/>' +
			'<line x1="' + X(S.mz) + '" x2="' + X(S.mz) + '" y1="12" y2="104" class="qc-limit"/><text x="' + X(S.mz) + '" y="122" class="cg-axis" text-anchor="middle">Q-Day ≈ ' + (now + S.mz) + "</text></svg>";
		$("qc-mchart").innerHTML = s + '<p class="cg-note qc-cap"><span class="qc-sw qc-my"></span> switching to post-quantum · <span class="qc-sw qc-mx2"></span> data must stay secret · <span class="qc-sw qc-mz"></span> years until a big quantum computer</p>';
		$("qc-mout").innerHTML = '<div class="cg-hero ' + (m.risk ? "cg-bad" : "cg-good") + '"><span class="cg-badge">' + (m.risk ? "At risk: start switching now" : "Still in time") + "</span><p>" + S.mx + " + " + S.my + " = " + (S.mx + S.my) + " years " + (m.risk ? "is more than" : "fits within") + " the " + S.mz + " years until Q-Day" + (m.risk ? ": data encrypted with classical key exchange from now on could still be secret when it gets decrypted." : ", with " + m.margin + " year" + (m.margin === 1 ? "" : "s") + " to spare.") + "</p></div>";
	}

	/* ---------- live post-quantum crypto (noble-post-quantum 0.7.1 from jsDelivr, on first use) ---------- */
	var NOBLE = "https://cdn.jsdelivr.net/npm/@noble/post-quantum@0.7.1/", libs = {};
	var imp = new Function("u", "return import(u)");
	function lib(name) { return libs[name] || (libs[name] = imp(NOBLE + name + ".js/+esm").catch(function () { return imp("https://esm.sh/@noble/post-quantum@0.7.1/" + name + ".js"); })); }
	function initPqc() {
		$("qc-kem").value = S.kem; $("qc-dsa").value = S.dsa;
		$("qc-kem").onchange = function () { S.kem = $("qc-kem").value; save(); }; $("qc-dsa").onchange = function () { S.dsa = $("qc-dsa").value; save(); };
		$("qc-kemgo").onclick = runKem; $("qc-dsago").onclick = function () { runDsa(false); }; $("qc-dsatamper").onclick = function () { runDsa(true); };
		$("qc-mybr").onclick = function () { myBrowser($("qc-mybrout")); };
	}
	function busy(el, t) { el.innerHTML = '<p class="cg-wait">' + t + "</p>"; }
	function sizeRow(l, b, note) { return "<tr><td>" + l + "</td><td>" + Q.bytesLabel(b.length) + "</td><td><code class=\"cg-hv cg-hv--sm\">" + hex(b, 24) + "…</code>" + (note ? " <small>" + note + "</small>" : "") + "</td></tr>"; }
	function runKem() {
		var out = $("qc-kemout"); busy(out, "Loading ML-KEM (about 30 KB)…");
		lib("ml-kem").then(function (m) {
			var k = m["ml_kem" + S.kem], t0 = performance.now(), kp = k.keygen(), t1 = performance.now(), en = k.encapsulate(kp.publicKey), t2 = performance.now(), ss = k.decapsulate(en.cipherText, kp.secretKey), t3 = performance.now();
			var same = hex(ss) === hex(en.sharedSecret);
			out.innerHTML = '<div class="qc-flow"><div><b>Bob</b><br>makes a key pair (' + (t1 - t0).toFixed(1) + ' ms)</div><div class="cg-arr">public key →</div><div><b>Alice</b><br>encapsulates a secret (' + (t2 - t1).toFixed(1) + ' ms)</div><div class="cg-arr">← ciphertext</div><div><b>Bob</b><br>decapsulates it (' + (t3 - t2).toFixed(1) + " ms)</div></div>" +
				'<div class="tu-table-wrap"><table class="tu-table cg-tab"><thead><tr><th>Piece</th><th>Size</th><th>Start of it</th></tr></thead><tbody>' + sizeRow("Public key (sent)", kp.publicKey) + sizeRow("Secret key (kept)", kp.secretKey) + sizeRow("Ciphertext (sent)", en.cipherText) + sizeRow("Shared secret, Alice", en.sharedSecret) + sizeRow("Shared secret, Bob", ss, same ? "✓ the same" : "✗") + "</tbody></table></div>" +
				'<p class="cg-note">The 32-byte shared secret becomes the AES key for the conversation. Compare classical X25519: 32-byte keys both ways. Post-quantum costs about 2 KB more per connection, which is why browsers send both together (X25519MLKEM768 = ' + (1184 + 32) + " + " + (1088 + 32) + " bytes).</p>";
		}).catch(function () { out.innerHTML = '<p class="cg-err">Could not load the post-quantum library (offline or blocked).</p>'; });
	}
	var lastSig = null;
	function runDsa(tamper) {
		var out = $("qc-dsaout"), isSlh = S.dsa === "slh"; busy(out, "Loading " + (isSlh ? "SLH-DSA" : "ML-DSA") + "…");
		lib(isSlh ? "slh-dsa" : "ml-dsa").then(function (m) {
			var alg = isSlh ? m.slh_dsa_sha2_128f : m["ml_dsa" + S.dsa.slice(2)], msg = $("qc-dmsg").value, enc = new TextEncoder();
			if (!tamper || !lastSig || lastSig.alg !== S.dsa) { var t0 = performance.now(), kp = alg.keygen(), t1 = performance.now(), sig = alg.sign(enc.encode(msg), kp.secretKey), t2 = performance.now(); lastSig = { alg: S.dsa, kp: kp, sig: sig, msg: msg, tk: t1 - t0, ts: t2 - t1 }; }
			var L = lastSig, check = L.msg;
			if (tamper) { var i = Math.floor(check.length / 2), ch = check[i]; check = check.slice(0, i) + (ch === "e" ? "a" : "e") + check.slice(i + 1); $("qc-dmsg").value = check; }
			var t3 = performance.now(), ok = alg.verify(L.sig, enc.encode(check), L.kp.publicKey), t4 = performance.now();
			out.innerHTML = '<div class="cg-hero ' + (ok ? "cg-good" : "cg-bad") + '"><span class="cg-badge">' + (ok ? "Signature valid" : "Signature does NOT match") + "</span><p>" + (tamper ? "Checked “" + esc(check) + "” against the signature made for “" + esc(L.msg) + "”: " + (ok ? "valid." : "changing one letter breaks it.") : "Signed and verified.") + " Keys " + L.tk.toFixed(1) + " ms · sign " + L.ts.toFixed(1) + " ms · verify " + (t4 - t3).toFixed(1) + " ms</p></div>" +
				'<div class="tu-table-wrap"><table class="tu-table cg-tab"><thead><tr><th>Piece</th><th>Size</th><th>Start of it</th></tr></thead><tbody>' + sizeRow("Public key", L.kp.publicKey) + sizeRow("Signature", L.sig) + "</tbody></table></div>" +
				'<p class="cg-note">An Ed25519 signature is 64 bytes; ' + (isSlh ? "SLH-DSA's are much bigger but rely only on a hash function, the most conservative choice." : "ML-DSA's are a few KB: the price of being quantum-safe.") + "</p>";
		}).catch(function () { out.innerHTML = '<p class="cg-err">Could not load the post-quantum library (offline or blocked).</p>'; });
	}

	showTab(S.tab);
	window.MESQCDebug = { S: S, showTab: showTab, runShor: runShor, measure: measure, runKem: runKem, runDsa: runDsa };
})();
