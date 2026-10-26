/* MES Contact page (mes.fm/contact): topic buttons that start a message in the Zotabox form, a fallback when a blocker hides
   the form, and copy-the-address. The form itself and ?name=&email=&subject=&message= prefill live in /main_js/contact-prefill.js
   (window.MESContactFill), which the rating row, the Android tester banner and the "Have a suggestion?" links rely on. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var TOPICS = {
		idea: ["Suggestion: a new calculator or tool", "Hi,\n\nI would like a calculator or tool that ...\n\nIt should let me ..."],
		bug: ["Problem on mes.fm", "Hi,\n\nPage: \nWhat I did: \nWhat happened: \nWhat I expected: \nDevice / browser: "],
		math: ["Math question", "Hi,\n\nMy question is about ...\n\n"],
		app: ["Mobile apps / Android testing", "Hi,\n\nI would like to help test the Android app(s). My Google Play email is: \n\n"],
		work: ["Working together", "Hi,\n\nI am ... and I would like to ...\n\n"],
		other: ["Message for MES", ""]
	};
	var cur = "";
	function q() { return new URLSearchParams(location.search); }
	document.querySelectorAll("#ct .ct-topic").forEach(function (b) {
		b.setAttribute("aria-pressed", "false");
		b.addEventListener("click", function () {
			var t = TOPICS[b.getAttribute("data-t")]; if (!t) return;
			document.querySelectorAll("#ct .ct-topic").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
			cur = t[1];
			if (window.MESContactFill) window.MESContactFill({ subject: t[0], message: t[1] }, { keepMessage: true });
			$("ct-hint").textContent = "Started your message: “" + t[0] + "”. Finish it in the form below.";
			$("ct-form").scrollIntoView({ behavior: "smooth", block: "start" });
		});
	});
	function copy(text, btn, label) {
		var done = function (ok) { btn.textContent = ok ? "Copied ✓" : "Select it and copy"; setTimeout(function () { btn.textContent = label; }, 2000); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
		else done(false);
	}
	$("ct-copy").addEventListener("click", function () { copy("contact@mes.fm", this, "Copy address"); });
	/* fallback: no form after ~12 s (blocked or down) -> offer email with the prefilled text */
	function formShown() {
		var w = $("zbwid-4d9973a2");
		return !!(w && (w.querySelector("iframe, form, input, textarea") || w.offsetHeight > 60)) || !!document.getElementById("ztb-cf-widget");
	}
	function draft() {
		var p = q(), subj = p.get("subject") || "Message for MES", msg = p.get("message") || cur || "";
		return { subj: subj, msg: msg };
	}
	var tries = 0, t = setInterval(function () {
		tries++;
		if (formShown()) { clearInterval(t); $("ct-loading").hidden = true; return; }
		if (tries >= 24) {
			clearInterval(t); $("ct-loading").hidden = true; $("ct-fallback").hidden = false;
			var d = draft();
			$("ct-fb-mail").href = "mailto:contact@mes.fm?subject=" + encodeURIComponent(d.subj) + (d.msg ? "&body=" + encodeURIComponent(d.msg) : "");
			if (d.msg) { $("ct-fb-text").hidden = false; $("ct-fb-text").textContent = d.msg; }
		}
	}, 500);
	$("ct-fb-copy").addEventListener("click", function () { var d = draft(); copy("To: contact@mes.fm\nSubject: " + d.subj + "\n\n" + d.msg, this, "Copy my message"); });
})();
