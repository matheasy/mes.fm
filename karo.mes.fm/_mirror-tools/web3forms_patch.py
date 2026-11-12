"""Point the mirror's contact forms at Web3Forms instead of mailto (one-off patch of assets/mirror.js)."""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, 'assets/mirror.js')
s = open(p).read()
if 'WEB3FORMS_KEY' in s:
    raise SystemExit('already patched')
a = s.index('  /* ---------- contact forms ----------')
b = s.index("    $$('input, textarea', f).forEach(function (el) {", a)
new = r"""  /* ---------- contact forms ----------
     Wix Forms does not work outside Wix, so the forms post to Web3Forms
     (api.web3forms.com), which emails each message to the address the access key
     was made for. The key is public by design (it can only send to that inbox).
     Without a key, or if the service can't be reached, the form falls back to
     opening the visitor's email app with the message filled in (mailto:). */
  var TO = 'info@alpinewestcreative.com';
  var WEB3FORMS_KEY = '';
  function formNote(f, text, ok) {
    var n = f.querySelector('.aw-form-note');
    if (!n) {
      n = document.createElement('p'); n.className = 'aw-form-note'; n.setAttribute('role', 'status');
      n.style.cssText = 'margin:12px 0 0;font:15px/1.4 helvetica-w01-roman,Arial,sans-serif;text-align:center';
      f.appendChild(n);
    }
    n.style.color = ok ? '#2f6b3a' : '#b3261e';
    n.textContent = text;
  }
  $$('form.wixui-form').forEach(function (f) {
    var btn = f.querySelector('button');
    if (btn) btn.setAttribute('type', 'submit');
    f.setAttribute('novalidate', '');
    var trap = document.createElement('input');
    trap.type = 'checkbox'; trap.name = 'botcheck'; trap.tabIndex = -1; trap.setAttribute('aria-hidden', 'true');
    trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    f.appendChild(trap);
    var busy = false;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var fields = $$('input, textarea', f).filter(function (el) { return el !== trap; });
      var ok = true, name = '', email = '', msg = '';
      fields.forEach(function (el) {
        var empty = !el.value.trim();
        var bad = (el.required && empty) || (el.type === 'email' && !empty && !/^.+@.+\.[a-zA-Z]{2,63}$/.test(el.value.trim()));
        el.setAttribute('aria-invalid', bad ? 'true' : 'false');
        if (bad) ok = false;
        if (el.tagName === 'TEXTAREA') msg = el.value.trim();
        else if (el.type === 'email') email = el.value.trim();
        else name = el.value.trim();
      });
      if (!ok) { var first = f.querySelector('[aria-invalid="true"]'); if (first) first.focus(); return; }
      var subject = 'Website enquiry' + (name ? ' from ' + name : '');
      var mailto = function () {
        location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(msg + '\n\n' + name + (email ? ' <' + email + '>' : ''));
      };
      if (!WEB3FORMS_KEY || !window.fetch) return mailto();
      if (trap.checked) return;
      busy = true;
      if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
      formNote(f, 'Sending...', true);
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY, subject: subject, from_name: 'Alpine West Creative website',
          name: name, email: email, replyto: email, message: msg, page: location.href, botcheck: false
        })
      }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (d) {
        if (d && d.success) {
          fields.forEach(function (el) { el.value = ''; el.setAttribute('aria-invalid', 'false'); });
          formNote(f, 'Thanks! Your message was sent. We\'ll get back to you soon.', true);
        } else {
          formNote(f, 'Sorry, the message could not be sent. Please email ' + TO + '.', false);
        }
      }).catch(function () {
        formNote(f, 'Sorry, the message could not be sent. Opening your email app instead...', false);
        setTimeout(mailto, 1200);
      }).then(function () {
        busy = false;
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
      });
    });
"""
open(p, 'w').write(s[:a] + new + s[b:])
print('patched')
