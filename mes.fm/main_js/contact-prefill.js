/* contact-prefill: lets another page deep-link here with the contact form already filled in, e.g.
   /contact?name=Tester&email=you%40example.com&subject=Android+App+Tester&message=I+want+to+test+the+app!
   -- the visitor still has to press the widget's own Send button themselves, nothing is submitted for them.

   The form itself is the Zotabox widget (see the zb-embed-code script above), rendered inside an
   <iframe id="ztb-cf-widget">. That iframe turns out to be same-origin (served from mes.fm, not a
   cross-site embed), so its #name/#email/#subject/#message fields are reachable from here -- but the
   widget is a Vue app, so just setting .value directly doesn't register: it needs the native property
   setter (bypassing the framework's own instrumented setter) plus a dispatched "input" event so Vue's
   reactivity picks up the change, exactly as if the visitor had typed it. Polls for up to 10s since the
   widget script loads and mounts asynchronously. */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var values = {
    name: params.get("name"),
    email: params.get("email"),
    subject: params.get("subject"),
    message: params.get("message"),
  };
  if (!values.name && !values.email && !values.subject && !values.message) return;

  function setVal(el, val) {
    var proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function tryFill() {
    var filled = false;
    Array.prototype.forEach.call(document.querySelectorAll("iframe"), function (frame) {
      var doc;
      try { doc = frame.contentDocument; } catch (e) { return; }
      if (!doc) return;
      var fields = { name: doc.getElementById("name"), email: doc.getElementById("email"), subject: doc.getElementById("subject"), message: doc.getElementById("message") };
      if (!fields.email && !fields.message) return; // not the contact-form widget
      Object.keys(values).forEach(function (key) {
        if (values[key] && fields[key]) setVal(fields[key], values[key]);
      });
      filled = true;
    });
    return filled;
  }

  var attempts = 0;
  var poll = setInterval(function () {
    attempts++;
    if (tryFill() || attempts >= 40) clearInterval(poll);
  }, 250);
})();
