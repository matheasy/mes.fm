/* MES Premium -- mes.fm/premium: no ads on mes.fm for 1 HBD a month, paid on the Hive blockchain.
 * Log in with Hive Keychain (MESHive.login: requestSignBuffer on the Posting key), then either Subscribe (Keychain
 * requestRecurrentTransfer: 1.000 HBD to @mes every 720 hours, N executions) or Pay once (requestTransfer, 1 HBD per
 * month). /api/premium?u=<user> reads the chain and answers {adFree, until, how}; this page keeps
 * localStorage "mes-adfree" = {user, until, how, checked, off?}, which the AdSense loaders (add_adfree_guard.py),
 * aside.js and bottom-ad.js respect; site-search.js re-checks once a day. "Show ads again" sets off: true (nothing is
 * cancelled on the chain); "Cancel my subscription" sends a 0 HBD recurrent transfer, which removes it.
 * ?mock=1 (or a local preview, which has no /api) answers the status from a fake that treats every payment as done.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pm");
	if (!root || !window.MESHive) return;
	var H = window.MESHive, esc = H.esc;
	var KEY = "mes-adfree", TO = "mes", MEMO = "mes.fm ad-free";
	var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1\b/.test(location.search);

	function get() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
	function put(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) {} }
	function fmtDate(ms) { return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); }
	function daysLeft(ms) { return Math.max(0, Math.ceil((ms - Date.now()) / 864e5)); }
	function msg(t, kind) { var m = $("pm-msg"); m.textContent = t || ""; m.className = "pm-msg" + (kind ? " " + kind : ""); }

	/* ---------- status from the chain ---------- */
	var mockPaid = null;   /* local preview only; kept for the tab's session so a reload keeps the fake payment */
	try { mockPaid = local ? JSON.parse(sessionStorage.getItem("mes-premium-mock") || "null") : null; } catch (e) {}
	function saveMock() { try { sessionStorage.setItem("mes-premium-mock", JSON.stringify(mockPaid)); } catch (e) {} }
	function check(user, fresh) {
		if (local) {
			return new Promise(function (res) {
				setTimeout(function () {
					var until = mockPaid && mockPaid.user === user ? mockPaid.until : 0;
					res({ user: user, adFree: until > Date.now(), untilMs: until, until: until ? new Date(until).toISOString() : null, how: until ? mockPaid.how : null,
						subscription: mockPaid && mockPaid.how === "subscription" ? { amount: "1.000 HBD", everyHours: 720, next: new Date(Date.now() + 30 * 864e5).toISOString(), remaining: 11, counts: true } : null,
						lastPayment: until ? { at: new Date().toISOString(), amount: "1.000 HBD", kind: mockPaid.how } : null, mock: true });
				}, 300);
			});
		}
		return fetch("/api/premium?u=" + encodeURIComponent(user) + (fresh ? "&n=" + Date.now() : ""), { credentials: "omit" })
			.then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; }); });
	}
	var last = null;
	function apply(d) {
		last = d;
		var rec = get() || {};
		var keep = rec.user === d.user ? rec.off : false;
		put({ user: d.user, until: d.adFree ? +d.untilMs : 0, how: d.how || null, checked: Date.now(), off: !!keep });
		paint();
	}
	function refresh(fresh) {
		var u = H.user();
		if (!u) { paint(); return Promise.resolve(); }
		$("pm-status").setAttribute("aria-busy", "true");
		return check(u.name, fresh).then(apply).catch(function (e) { msg("Could not check the blockchain: " + e.message, "err"); paint(); })
			.then(function () { $("pm-status").removeAttribute("aria-busy"); });
	}

	/* after a payment the transfer needs a block (3 s) and the API a moment: poll a few times */
	function pollPaid(user, tries) {
		return check(user, true).then(function (d) {
			if (d.adFree || tries <= 1) { apply(d); return d; }
			return new Promise(function (r) { setTimeout(r, 4000); }).then(function () { return pollPaid(user, tries - 1); });
		});
	}

	/* ---------- painting ---------- */
	function paint() {
		var u = H.user(), rec = get(), st = $("pm-status");
		var on = rec && rec.until > Date.now();
		var html;
		if (rec && on && (!u || rec.user === u.name)) {
			html = '<div class="pm-badge pm-badge--on">' + (rec.off ? "Ads are showing (you turned them back on)" : "Ad-free in this browser") + "</div>" +
				"<p>Paid by <b>@" + esc(rec.user) + "</b>" + (rec.how === "subscription" ? " with a monthly subscription" : "") + ": no ads until <b>" + esc(fmtDate(rec.until)) + "</b> (" + daysLeft(rec.until) + " days" + (rec.how === "subscription" ? ", renews automatically" : "") + ").</p>" +
				'<div class="pm-acts">' + (rec.off ? '<button type="button" class="tu-btn tu-btn--primary" data-a="hide">Hide the ads again</button>' : '<button type="button" class="tu-btn" data-a="show">Show ads again</button>') +
				(u ? '<button type="button" class="tu-btn tu-btn--ghost" data-a="check">Check my payment</button>' : "") +
				(last && last.subscription && last.subscription.counts ? '<button type="button" class="tu-btn tu-btn--ghost" data-a="cancel">Cancel my subscription</button>' : "") +
				'<a class="tu-btn tu-btn--ghost" href="/">Go to mes.fm</a></div>' +
				(last && last.mock ? '<p class="tu-note">Local preview: this status is simulated.</p>' : "");
		} else if (u) {
			html = '<div class="pm-badge">Ads are on</div><p>Logged in as <b>@' + esc(u.name) + "</b>. " + (rec && rec.user === u.name && rec.checked ? "No current payment found on the chain" + (rec.until ? " (the last one ran out on " + esc(fmtDate(rec.until)) + ")" : "") + "." : "Press Check my payment if you already paid.") + "</p>" +
				'<div class="pm-acts"><button type="button" class="tu-btn tu-btn--ghost" data-a="check">Check my payment</button></div>';
		} else {
			html = '<div class="pm-badge">Ads are on</div><p>Log in with Hive Keychain below, then pay 1 HBD to turn them off in this browser.</p>';
		}
		st.innerHTML = html;
		paintAcct();
		var dis = !u;
		$("pm-sub").disabled = dis; $("pm-once").disabled = dis;
		$("pm-pay").classList.toggle("pm-dim", dis);
	}
	function paintAcct() {
		var u = H.user(), a = $("pm-acct");
		if (u) {
			a.innerHTML = '<div class="pm-user"><img src="' + esc(H.avatar(u.name)) + '" alt="" width="36" height="36"><span>Logged in as <a href="' + esc(H.peakd(u.name) + "/wallet") + '" target="_blank" rel="noopener">@' + esc(u.name) + '</a></span><button type="button" class="tu-btn tu-btn--ghost" data-a="logout">Log out</button></div>';
			$("pm-help").innerHTML = "";
		} else {
			a.innerHTML = '<div class="pm-loginrow"><label class="tu-label" for="pm-user">Hive username</label><input id="pm-user" class="tu-input" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. mes">' +
				'<button type="button" class="tu-btn tu-btn--primary" data-a="login">Log in with Keychain</button></div>';
			var inp = $("pm-user");
			inp.addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
			H.keychain(1500).then(function (k) { if (!k && !H.user()) $("pm-help").innerHTML = H.helpHtml(); });
		}
	}

	/* ---------- actions ---------- */
	function doLogin() {
		var inp = $("pm-user");
		msg("Confirm the login in Hive Keychain…");
		H.login(inp ? inp.value : "").then(function (u) { msg("Logged in as @" + u.name + ".", "ok"); return refresh(true); })
			.catch(function (e) { msg(e.code === "nokeychain" ? "Hive Keychain is not installed in this browser (see below)." : e.message, "err"); if (e.code === "nokeychain") $("pm-help").innerHTML = H.helpHtml(); });
	}
	function afterPay(how, months) {
		var u = H.user();
		msg("Payment sent. Waiting for the blockchain to confirm it…");
		if (local) { mockPaid = { user: u.name, how: how, until: Math.max(Date.now(), (mockPaid && mockPaid.until) || 0) + months * 31 * 864e5 }; saveMock(); }
		return pollPaid(u.name, 6).then(function (d) {
			if (d.adFree) msg("Thank you! mes.fm has no ads in this browser until " + fmtDate(d.untilMs) + ".", "ok");
			else msg("The payment is not on the chain yet. Wait a minute and press Check my payment.", "err");
		}).catch(function (e) { msg("Paid, but the check failed (" + e.message + "). Press Check my payment in a minute.", "err"); });
	}
	function subscribe() {
		var n = +$("pm-exec").value || 12;
		msg("Confirm the subscription in Hive Keychain…");
		H.recurrentTransfer(TO, 1, "HBD", MEMO, 720, n).then(function () { return afterPay("subscription", 1); })
			.catch(function (e) { msg(e.message || "Cancelled.", "err"); });
	}
	function payOnce() {
		var m = +$("pm-months").value || 1;
		msg("Confirm the payment in Hive Keychain…");
		H.transfer(TO, m, "HBD", MEMO).then(function () { return afterPay("payment", m); })
			.catch(function (e) { msg(e.message || "Cancelled.", "err"); });
	}
	function cancelSub() {
		if (!confirm("Stop the monthly 1 HBD to @mes? What you already paid keeps counting until it runs out.")) return;
		msg("Confirm in Hive Keychain (a 0 HBD recurrent transfer removes the subscription)…");
		H.recurrentTransfer(TO, 0, "HBD", MEMO, 720, 2).then(function () {
			if (local && mockPaid) { mockPaid.how = "payment"; saveMock(); }
			msg("Subscription cancelled.", "ok");
			return refresh(true);
		}).catch(function (e) { msg(e.message || "Cancelled.", "err"); });
	}
	root.addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]");
		if (!b) return;
		var a = b.getAttribute("data-a"), rec = get();
		if (a === "login") doLogin();
		else if (a === "logout") { H.logout(); msg("Logged out. This browser stays ad-free until the date above."); paint(); }
		else if (a === "check") { msg("Checking the blockchain…"); refresh(true).then(function () { var r = get(); if (r && r.until > Date.now()) msg("Found it: ad-free until " + fmtDate(r.until) + ".", "ok"); else if (!$("pm-msg").classList.contains("err")) msg("No payment from @" + (H.user() || {}).name + " to @mes covers today.", ""); }); }
		else if (a === "show" && rec) { rec.off = true; put(rec); msg("Ads will show again on the next page you open. You can hide them again here any time.", "ok"); paint(); }
		else if (a === "hide" && rec) { rec.off = false; put(rec); msg("Ads hidden again.", "ok"); paint(); }
		else if (a === "cancel") cancelSub();
	});
	$("pm-sub").addEventListener("click", subscribe);
	$("pm-once").addEventListener("click", payOnce);
	$("pm-months").addEventListener("change", function () {
		var m = +this.value || 1;
		$("pm-once-n").textContent = m; $("pm-once-m").textContent = m === 1 ? "1 month" : m + " months";
		$("pm-once").textContent = "Pay " + m + " HBD for " + (m === 1 ? "1 month" : m + " months");
	});
	H.onChange(function () { paint(); });
	paint();
	if (H.user()) refresh(false);
})();
