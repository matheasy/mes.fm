/* android-testers.js -- "become an Android tester" note for the MES apps in Google Play closed testing (2026-11-02).
   A personal Play developer account needs 12 opted-in testers for 14 days before an app can go public, so each app's
   web page carries a closable note (same look as the Percentage Calculator's original #android-testers-banner).
   Flow: 1. join the public Google Group (GROUP below; any Google account), 2. open the app's Play join link and tap
   "Become a tester", 3. install the app and keep it 14 days. /contact (contact-prefill.js query contract) is only the
   "Problem joining? Contact us." fallback.

   ALL the wording lives in GROUP / APPS / TEXT below (one place): change the group address or the steps here only.

   Markup on a page (inside <!-- ANDROID-TESTERS-BANNER --> ... <!-- /ANDROID-TESTERS-BANNER -->, which every app's
   build-www.py strips, and which sits before the tool's own <div class="tu"> so it is never extracted anyway):
     <div id="android-testers-banner" data-mes-tester="bmi" hidden></div>   closable note, the choice remembered per app
     <details class="android-testers" data-mes-tester="bmi">...</details>    mobile-apps.html: the body is filled in here
*/
(function () {
  "use strict";
  // The one place the Google Group lives: change both lines if the group address changes.
  var GROUP = { email: "mes-android-testers@googlegroups.com", url: "https://groups.google.com/g/mes-android-testers" };
  var APPS = {
    pct: { name: "MES Percentage Calculator", pkg: "fm.mes.percentagecalculator", key: "percentagecalculatorAppBannerHidden",
      ios: "https://apps.apple.com/us/app/mes-percentage-calculator/id6809222891" },
    bmi: { name: "MES BMI Calculator", pkg: "fm.mes.bmicalculator", key: "bmicalculatorAppBannerHidden",
      ios: "https://apps.apple.com/us/app/id6824009307" },
    grade: { name: "MES Grade Calculator", pkg: "fm.mes.gradecalculator", key: "gradecalculatorAppBannerHidden",
      ios: "https://apps.apple.com/us/app/id6824035179" },
    gpa: { name: "MES GPA Calculator", pkg: "fm.mes.gpacalculator", key: "gpacalculatorAppBannerHidden",
      ios: "https://apps.apple.com/us/app/id6824052607" },
    fitness: { name: "MES Fitness Calculators", pkg: "fm.mes.fitnesscalculators", key: "fitnesscalculatorsAppBannerHidden",
      ios: "https://apps.apple.com/us/app/id6824113713", extra: " (13 health and training calculators in one app)" }
  };
  function joinUrl(a) { return "https://play.google.com/apps/testing/" + a.pkg; }
  function ext(href, text) { return '<a href="' + href + '" target="_blank" rel="noopener">' + text + "</a>"; }
  var TEXT = {
    title: function (a) { return "&#128241; " + a.name + " for Android: testers wanted"; },
    intro: function (a) {
      return "The " + a.name + " app" + (a.extra || "") + " is in beta testing on Google Play, and Google needs testers before it can go public. " +
        "It's free and takes a minute" + (a.ios ? " (the iPhone version is already " + ext(a.ios, "on the App Store") + ")" : "") + ":";
    },
    steps: function (a) {
      return "<ol class=\"mes-tester-steps\">" +
        "<li>" + ext(GROUP.url, "Join the Google group") + " (one tap, any Google account).</li>" +
        "<li>Open the " + ext(joinUrl(a), "app's join link") + " and tap <b>Become a tester</b>.</li>" +
        "<li>Install the app from Google Play and keep it installed for 14 days. You can leave after that.</li></ol>";
    },
    fallback: function (a) {
      var q = new URLSearchParams({ subject: "Android App Tester: " + a.name,
        message: "I tried to join the " + a.name + " Android test (group " + GROUP.email + ") but ran into a problem: " });
      return 'Problem joining? <a href="/contact?' + q.toString() + '">Contact us.</a>';
    },
    summary: "Android: beta testing &mdash; become a tester"
  };
  function body(a) {
    return "<p>" + TEXT.intro(a) + "</p>" + TEXT.steps(a) +
      '<p class="mes-tester-btns">' + '<a class="mes-tester-go" href="' + GROUP.url + '" target="_blank" rel="noopener">1. Join the group</a> ' +
      '<a class="mes-tester-go mes-tester-go--2" href="' + joinUrl(a) + '" target="_blank" rel="noopener">2. Become a tester</a></p>' +
      '<p class="mes-tester-small">' + TEXT.fallback(a) + "</p>";
  }

  var CSS = "#android-testers-banner{position:relative;border:0.125em solid #1479c7;background-color:#daf1fd;color:#1f2a33;padding:0.8em 2.2em 0.8em 1em;margin:0.7em 0 1em;line-height:1.4;}" +
    "#android-testers-banner strong,#android-testers-banner p,#android-testers-banner li,#android-testers-banner div,#android-testers-banner span,#android-testers-banner b{color:#1f2a33;}" +
    "#android-testers-banner strong{color:#0f4f85;}" +
    "#android-testers-banner p{margin:0.4em 0 0;}" +
    "#android-testers-banner a{color:#0f5ea3;text-decoration:underline;}" +
    "#android-testers-banner .mes-tester-x{position:absolute;top:0.4em;right:0.4em;width:1.6em;height:1.6em;padding:0;border:0;background:transparent;color:#0f5ea3;font-size:1.1em;line-height:1;cursor:pointer;}" +
    ".mes-tester-steps{margin:0.4em 0 0;padding-left:1.6em;}" +
    "details.android-testers .mes-tester-steps{margin:0 0.8em 0.6em;}" +
    ".mes-tester-steps li{margin:0.2em 0;list-style:decimal;}" +
    ".mes-tester-btns{display:flex;flex-wrap:wrap;gap:0.5em;}" +
    "#android-testers-banner p.mes-tester-btns{margin-top:0.7em;}" +
    ".android-testers p.mes-tester-small,#android-testers-banner p.mes-tester-small{font-size:0.9em;margin-top:0.5em;}" +
    ".android-testers a.mes-tester-go,#android-testers-banner a.mes-tester-go{display:inline-block;white-space:nowrap;padding:0.55em 1.1em;font-weight:700;color:#fff !important;background:#1479c7;border:0.125em solid #1479c7;border-radius:0.3em;text-decoration:none !important;}" +
    ".android-testers a.mes-tester-go:hover,#android-testers-banner a.mes-tester-go:hover{background:#0f5ea3;border-color:#0f5ea3;}" +
    "body.dark-mode #android-testers-banner{background-color:#16283a;border-color:#5aa9e6;}" +
    "body.dark-mode #android-testers-banner strong{color:#9fd0f5;}" +
    "body.dark-mode #android-testers-banner p,body.dark-mode #android-testers-banner li,body.dark-mode #android-testers-banner div,body.dark-mode #android-testers-banner span,body.dark-mode #android-testers-banner b{color:#e6edf3;}" +
    "body.dark-mode #android-testers-banner a,body.dark-mode #android-testers-banner .mes-tester-x,body.dark-mode .android-testers a{color:#9fd0f5;}" +
    "body.dark-mode .android-testers li{color:#e6edf3;}" +
    "body.dark-mode .android-testers a.mes-tester-go,body.dark-mode #android-testers-banner a.mes-tester-go{background:#5aa9e6;border-color:#5aa9e6;color:#0f1113 !important;}" +
    "body.dark-mode .android-testers a.mes-tester-go:hover,body.dark-mode #android-testers-banner a.mes-tester-go:hover{background:#7cbdf0;border-color:#7cbdf0;}";

  function init() {
    var nodes = document.querySelectorAll("[data-mes-tester]");
    if (!nodes.length) return;
    if (!document.getElementById("mes-tester-css")) {
      var st = document.createElement("style");
      st.id = "mes-tester-css";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    Array.prototype.forEach.call(nodes, function (el) {
      var a = APPS[el.getAttribute("data-mes-tester")];
      if (!a || el.getAttribute("data-mes-tester-done")) return;
      el.setAttribute("data-mes-tester-done", "1");
      if (el.tagName === "DETAILS") {          // mobile-apps.html signup
        var sum = el.querySelector("summary");
        el.innerHTML = (sum ? sum.outerHTML : "<summary>" + TEXT.summary + "</summary>") + '<div class="mes-tester-body">' + body(a) + "</div>";
        return;
      }
      var hidden = null;                       // closable note on the calculator page
      try { hidden = localStorage.getItem(a.key); } catch (e) {}
      if (hidden) { el.hidden = true; return; }
      el.className = "android-testers";
      el.setAttribute("role", "region");
      el.setAttribute("aria-label", "Android testers wanted");
      el.innerHTML = '<button type="button" class="mes-tester-x" aria-label="Hide this" title="Hide this">&times;</button>' +
        "<strong>" + TEXT.title(a) + "</strong>" + body(a);
      el.querySelector(".mes-tester-x").addEventListener("click", function () {
        el.hidden = true;
        try { localStorage.setItem(a.key, "1"); } catch (e) {}
      });
      el.hidden = false;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.MESAndroidTesters = { GROUP: GROUP, APPS: APPS, init: init };
})();
