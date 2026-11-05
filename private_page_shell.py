"""Standard | Wide | Theatre switch for sidebar-less pages in the math-hub mirror shell (hive_mirror_template.html), 2026-11-04.
hub-theatre.js puts its switch at the top of the first .container (above the header, squashing the brand) and has no Wide width
for that shell, so these pages carry their own: the switch sits at the right end of the "Part of" box (where aside.js puts it on
the article pages), same localStorage pageMode / pageWide as the rest of the site, Wide by default, >= 1200px only.
Used by build_djw_columbia_emails.py and build_pdf_page.py (private=True pages)."""
HEAD = ('<!-- PAGE3-SHELL-HEAD --><script>try{var m=localStorage.getItem("pageMode")||"wide",c=document.documentElement.classList;'
        'if(m==="theatre")c.add("page-theatre");if(m!=="std")c.add("page-wide")}catch(e){}</script><style>'
        '.pw-mode{display:none}'
        '@media (min-width:1200px){'
        '.part-of.pw-host{display:flex;align-items:center;justify-content:space-between;gap:.8em;flex-wrap:wrap}'
        '.pw-mode{display:inline-flex;flex:0 0 auto;border:1px solid #b9c2cc;border-radius:999px;overflow:hidden;font-size:.95em;font-weight:400}'
        '.pw-mode button{border:0;background:transparent;color:#1479c7;font:inherit;padding:.22em .8em;cursor:pointer}'
        '.pw-mode button+button{border-left:1px solid #d5dbe2}.pw-mode button:hover{background:#e8f2fb}'
        '.pw-mode button[aria-pressed="true"]{background:#1479c7;color:#fff}'
        'body.dark .pw-mode{background:#2e2e2e;border-color:#555}body.dark .pw-mode button{color:#6cb6f5}'
        'body.dark .pw-mode button+button{border-left-color:#555}body.dark .pw-mode button:hover{background:#3a3a3a}'
        'body.dark .pw-mode button[aria-pressed="true"]{background:#1479c7;color:#fff}'
        'html.page-wide .container,html.page-wide .footer{max-width:min(96vw,1100px)}'
        'html.page-theatre .container,html.page-theatre .footer{max-width:min(98vw,2400px)}'
        'html.page-wide .pdf-frame{height:88vh}}'
        '</style><!-- /PAGE3-SHELL-HEAD -->')
JS = ('<!-- PAGE3-SHELL-JS --><script>(function(){var box=document.querySelector(".part-of");if(!box)return;var r=document.documentElement,'
      'M=[["std","Standard","Normal page width"],["wide","Wide","A wider page"],["theatre","Theatre","Use nearly the whole window"]],b={},'
      'g=document.createElement("span");g.className="pw-mode";g.setAttribute("role","group");g.setAttribute("aria-label","Page width");'
      'function cur(){return r.classList.contains("page-theatre")?"theatre":r.classList.contains("page-wide")?"wide":"std"}'
      'function paint(){var c=cur();M.forEach(function(x){b[x[0]].setAttribute("aria-pressed",String(x[0]===c))})}'
      'M.forEach(function(x){var e=document.createElement("button");e.type="button";e.textContent=x[1];e.title=x[2];'
      'e.onclick=function(){r.classList.toggle("page-theatre",x[0]==="theatre");r.classList.toggle("page-wide",x[0]!=="std");'
      'try{localStorage.setItem("pageMode",x[0]);localStorage.setItem("pageWide",x[0]!=="std"?"1":"0")}catch(err){}paint();'
      'try{window.dispatchEvent(new Event("resize"))}catch(err){}};b[x[0]]=e;g.appendChild(e)});'
      'var t=document.createElement("span");while(box.firstChild)t.appendChild(box.firstChild);box.appendChild(t);box.appendChild(g);'
      'box.classList.add("pw-host");paint()})();</script><!-- /PAGE3-SHELL-JS -->')
def apply(t):
    """add the switch to a page built from hive_mirror_template.html"""
    t = t.replace('<link rel="canonical"', HEAD + '\n  <link rel="canonical"', 1)
    return t.replace("</body>", JS + "\n</body>", 1)
