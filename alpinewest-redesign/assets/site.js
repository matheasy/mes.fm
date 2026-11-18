/* Alpine West Creative: header, reveals, films, inquiry form, click tracking. */
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");

  /* Analytics: Vercel Web Analytics (window.va) or Google Tag (window.gtag) if either is on the page. */
  function track(name, data) {
    try { if (window.va) window.va("event", { name: name, data: data || {} }); } catch (e) {}
    try { if (window.gtag) window.gtag("event", name, data || {}); } catch (e) {}
    (window.dataLayer = window.dataLayer || []).push({ event: name, data: data || {} });
  }
  window.AWTrack = track;
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-track]");
    if (a) track("proposal_click", { where: a.getAttribute("data-track") });
  });

  /* Header: solid after the hero, hides while scrolling down on phones, dock button takes over. */
  var hdr = document.querySelector("[data-hdr]");
  var dock = document.querySelector("[data-dock]");
  var finalSec = document.querySelector("[data-final]");
  var onInquire = /^\/inquire/.test(location.pathname);
  var lastY = window.scrollY, ticking = false, finalVisible = false;
  var phone = window.matchMedia("(max-width: 860px)");
  function onScroll() {
    var y = window.scrollY;
    var heroH = document.querySelector(".hero, .phero, .nf") ? Math.max(window.innerHeight, 480) * 0.75 : 10;
    hdr.classList.toggle("is-solid", y > heroH - 70);
    var down = y > lastY + 4, up = y < lastY - 4;
    if (phone.matches && !document.body.classList.contains("menu-open")) {
      if (down && y > 200) hdr.classList.add("is-hidden");
      else if (up || y < 200) hdr.classList.remove("is-hidden");
    } else hdr.classList.remove("is-hidden");
    if (dock) dock.classList.toggle("is-on", !onInquire && phone.matches && y > window.innerHeight * 0.6 && !finalVisible && !document.body.classList.contains("menu-open"));
    lastY = y; ticking = false;
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  if (finalSec && "IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { finalVisible = es[0].isIntersecting; onScroll(); }, { threshold: 0.2 }).observe(finalSec);
  }

  /* Menu */
  var mbtn = document.querySelector("[data-menu]"), menu = document.getElementById("menu");
  function setMenu(open) {
    mbtn.setAttribute("aria-expanded", open ? "true" : "false");
    menu.hidden = !open;
    document.body.classList.toggle("menu-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  }
  if (mbtn) {
    mbtn.addEventListener("click", function () { setMenu(menu.hidden); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { setMenu(false); mbtn.focus(); } });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
  }

  /* Reveal on scroll */
  var rev = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); ro.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    rev.forEach(function (el) { ro.observe(el); });
  } else rev.forEach(function (el) { el.classList.add("is-in"); });

  /* Films: load + play only while on screen, muted; one sound button each. */
  var films = document.querySelectorAll(".film video");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if ("IntersectionObserver" in window) {
    var fo = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) {
          if (!v.src) v.src = v.getAttribute("data-src");
          if (!still || !v.muted) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } else if (!v.paused) v.pause();
      });
    }, { threshold: 0.35 });
    films.forEach(function (v) { fo.observe(v); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".film__sound");
    if (!b) return;
    var v = b.parentNode.querySelector("video");
    if (!v.src) v.src = v.getAttribute("data-src");
    var on = v.muted;
    films.forEach(function (o) { if (o !== v) { o.muted = true; var ob = o.parentNode.querySelector(".film__sound"); ob.setAttribute("aria-pressed", "false"); ob.textContent = "Sound off"; } });
    v.muted = !on; if (on) { v.currentTime = 0; v.play().catch(function () {}); }
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.textContent = on ? "Sound on" : "Sound off";
    b.setAttribute("aria-label", on ? "Turn the sound off" : "Turn the sound on");
  });

  /* Inquiry form: Web3Forms when a key is set, otherwise opens the visitor's email app with everything filled in. */
  var form = document.querySelector("[data-inquiry]");
  if (form) {
    var key = form.getAttribute("data-key") || "";
    var status = form.querySelector("[data-status]");
    var btn = form.querySelector("button[type=submit]");
    var started = false;
    form.addEventListener("input", function () { if (!started) { started = true; track("inquiry_start"); } }, { once: false });
    var q = new URLSearchParams(location.search);
    if (q.get("type")) { var sel = form.querySelector("[name=project_type]"); if (sel) sel.value = q.get("type"); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (form.querySelector("[name=botcheck]").checked) return;
      var fd = new FormData(form);
      var lines = [];
      [["name", "Name"], ["email", "Email"], ["company", "Hotel / company"], ["location", "Property location"], ["project_type", "Project type"], ["timeline", "Timeline"], ["budget", "Budget"], ["message", "Project"]]
        .forEach(function (f) { var v = (fd.get(f[0]) || "").toString().trim(); if (v) lines.push(f[1] + ": " + v); });
      var subject = "Proposal request: " + ((fd.get("company") || fd.get("name") || "") + "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(key)) {
        location.href = "mailto:info@alpinewestcreative.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(lines.join("\n"));
        status.textContent = "Your email app should open with the message ready to send. If it doesn't, write to info@alpinewestcreative.com.";
        track("inquiry_mailto");
        return;
      }
      fd.append("access_key", key);
      fd.append("subject", subject);
      fd.append("from_name", "Alpine West Creative website");
      btn.disabled = true; btn.textContent = "Sending…"; status.textContent = "";
      fetch("https://api.web3forms.com/submit", { method: "POST", body: fd, headers: { Accept: "application/json" } })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.success, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j && res.j.message || "failed");
          form.hidden = true;
          document.querySelector("[data-thanks]").hidden = false;
          document.querySelector("[data-thanks]").focus();
          track("inquiry_submit", { type: fd.get("project_type") || "" });
        })
        .catch(function () {
          btn.disabled = false; btn.innerHTML = 'Send inquiry <span aria-hidden="true">→</span>';
          status.innerHTML = 'Sorry, that didn’t send. Please email <a href="mailto:info@alpinewestcreative.com">info@alpinewestcreative.com</a>.';
        });
    });
  }
})();
