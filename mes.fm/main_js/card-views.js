/* MES card views: a "View: Cards | List | Compact | Table" switch for a plain grid of cards (the Mobile Apps and Extensions pages),
   the same idea as the calculators / tools hubs (hub-filter.js), but for any markup. Put it on the element that holds the cards:
     <div data-card-views="mobile-apps" data-cv-item=".app-card" data-cv-title="h2" data-cv-desc="p" data-cv-img="img">
   Optional: data-cv-link = selector of the card's own page link (else the card itself when it is an <a>); data-cv-label = what the
   "Get it" column is called. App Store / Android beta links are found automatically (.app-store-link, #app-store-link, .android-testers).
   Cards view = the page's own markup; the other views are built from it. Choice saved per page in localStorage "mes-cardviews:<key>". */
(function () {
  "use strict";
  var ICON = {
    cards: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z"/></svg>',
    list: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1.5h3v3H1zM5.5 2h9.5v2H5.5zM1 6.5h3v3H1zM5.5 7h9.5v2H5.5zM1 11.5h3v3H1zM5.5 12h9.5v2H5.5z"/></svg>',
    compact: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2h6.5v3H1zM8.5 2H15v3H8.5zM1 6.5h6.5v3H1zM8.5 6.5H15v3H8.5zM1 11h6.5v3H1zM8.5 11H15v3H8.5z"/></svg>',
    table: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1h14v14H1zm1.5 1.5v2.5h11V2.5zm0 4v2.5h4V6.5zm5.5 0v2.5h5.5V6.5zm-5.5 4v2.5h4v-2.5zm5.5 0v2.5h5.5v-2.5z"/></svg>'
  };
  var NAMES = { cards: "Cards", list: "List", compact: "Compact", table: "Table" };
  var CSS =
    ".cv-row{display:flex;align-items:center;flex-wrap:wrap;gap:.3em .5em;margin:0 0 .9em}" +
    ".cv-lbl{font-size:.85em;color:#555}" +
    ".cv-views{display:inline-flex;border:1px solid #c3c9d2;border-radius:.5em;overflow:hidden}" +
    ".cv-views button{font:inherit;font-size:.85em;cursor:pointer;padding:.4em .85em;border:0;border-left:1px solid #c3c9d2;background:#fff;color:#444;display:inline-flex;align-items:center;gap:.4em}" +
    ".cv-views button:first-child{border-left:0}.cv-views button svg{width:1.05em;height:1.05em;fill:currentColor;flex:none}" +
    ".cv-views button span{color:inherit !important}" +
    ".cv-views button:hover{color:#1a5f94}.cv-views button:focus-visible{outline:2px solid #277bb6;outline-offset:-2px}" +
    ".cv-views button[aria-pressed=true]{background:#277bb6;color:#fff}" +
    "@media (max-width:700px),(pointer:coarse){.cv-views button{min-height:36px}}" +
    "@media (max-width:420px){.cv-views button{padding:.4em .55em;gap:.3em}}" +
    "body.dark-mode .cv-views,body.dark-mode .cv-views button{border-color:#555}body.dark-mode .cv-views button{background:#2a2a2a;color:#ddd}" +
    "body.dark-mode .cv-views button[aria-pressed=true]{background:#6cb6f5;color:#111}body.dark-mode .cv-lbl{color:#bbb}" +
    ".cv-alt[hidden],.cv-host.cv-off{display:none !important}" +
    ".cv-alt{margin:0 0 1.2em}.cv-alt *{color:inherit}" +
    ".cv-alt a{text-decoration:none}" +
    /* list */
    ".cv-list{display:grid;gap:.45em}" +
    ".cv-li{display:flex;align-items:center;gap:.8em;padding:.5em .7em;border:1px solid #c9d3de;border-radius:.5em;background:#fff;color:#1f2a33}" +
    ".cv-li img{width:3em;height:3em;border-radius:22%;flex:none;object-fit:cover}" +
    ".cv-li .cv-tx{flex:1 1 auto;min-width:0}" +
    ".cv-li .cv-nm{font-weight:700;color:#0f4f85;cursor:pointer}.cv-li .cv-nm:hover{text-decoration:underline}" +
    ".cv-li .cv-ds{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:.9em;line-height:1.35;color:#4a5560;margin-top:.1em}" +
    ".cv-li .cv-gets{flex:none;display:flex;flex-direction:column;gap:.3em;align-items:stretch}" +
    "@media (max-width:560px){.cv-li{flex-wrap:wrap}.cv-li .cv-tx{flex-basis:calc(100% - 4em)}.cv-li .cv-gets{flex-direction:row;flex-wrap:wrap;width:100%}}" +
    /* compact */
    ".cv-compact{display:grid;gap:.4em;grid-template-columns:repeat(auto-fill,minmax(13em,1fr))}" +
    "@media (max-width:420px){.cv-compact{grid-template-columns:1fr 1fr}}" +
    ".cv-pill{display:flex;align-items:center;gap:.5em;min-width:0;padding:.3em .9em .3em .3em;border:1px solid #c9d3de;border-radius:2em;background:#fff;color:#0f4f85;cursor:pointer;font:inherit;text-align:left}" +
    ".cv-pill:hover{border-color:#277bb6}.cv-pill img{width:1.9em;height:1.9em;border-radius:.45em;flex:none;object-fit:cover}" +
    ".cv-pill span{font-size:.95em;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}" +
    /* table */
    ".cv-tw{overflow-x:auto;border:1px solid #c9d3de;border-radius:.5em}" +
    ".cv-table{width:100%;border-collapse:collapse;font-size:.92em;background:#fff;color:#1f2a33}" +
    ".cv-table th,.cv-table td{padding:.5em .65em;border-bottom:1px solid #e1e6ec;text-align:left;vertical-align:middle}" +
    ".cv-table th{background:#eef3f8;font-size:.85em;white-space:nowrap}.cv-table tr:last-child td{border-bottom:0}" +
    ".cv-table td.cv-tn{min-width:11em}.cv-table td.cv-tn div{display:flex;align-items:center;gap:.55em}" +
    ".cv-table td.cv-tn img{width:2em;height:2em;border-radius:.45em;flex:none;object-fit:cover}" +
    ".cv-table td.cv-tn b{color:#0f4f85;cursor:pointer}.cv-table td.cv-tn b:hover{text-decoration:underline}" +
    ".cv-table td.cv-td{min-width:14em;line-height:1.35;color:#4a5560}" +
    ".cv-table td.cv-tg{white-space:nowrap}.cv-table td.cv-tg .cv-get{margin:.15em .3em .15em 0}" +
    "@media (max-width:600px){.cv-table td.cv-td{display:none}.cv-table th.cv-td{display:none}.cv-table td.cv-tn{min-width:0}" +
    ".cv-table td.cv-tg{white-space:normal;width:1%}.cv-table td.cv-tg .cv-get{display:block;margin:.2em 0}}" +
    /* get-it buttons */
    ".cv-get{display:inline-block;padding:.3em .7em;border-radius:.35em;font-size:.85em;font-weight:700;white-space:nowrap;border:1px solid #1479c7;color:#0f4f85;background:#fff;text-align:center}" +
    ".cv-get.ios{background:#1479c7;color:#fff !important}.cv-get:hover{filter:brightness(1.08)}" +
    ".cv-badge{display:inline-block;font-size:.72em;font-weight:700;padding:.1em .5em;border-radius:999px;background:#1f9d55;color:#fff !important;margin-left:.4em;vertical-align:middle}" +
    /* dark */
    "body.dark-mode .cv-li,body.dark-mode .cv-pill,body.dark-mode .cv-table{background:#1f2327;color:#e6edf3;border-color:#3a434d}" +
    "body.dark-mode .cv-tw{border-color:#3a434d}body.dark-mode .cv-table th{background:#2a3038}body.dark-mode .cv-table th,body.dark-mode .cv-table td{border-color:#333b44}" +
    "body.dark-mode .cv-li .cv-nm,body.dark-mode .cv-pill,body.dark-mode .cv-table td.cv-tn b{color:#9fd0f5}" +
    "body.dark-mode .cv-li .cv-ds,body.dark-mode .cv-table td.cv-td{color:#b9c3cc}" +
    "body.dark-mode .cv-get{background:#1f2327;color:#9fd0f5;border-color:#5aa9e6}body.dark-mode .cv-get.ios{background:#5aa9e6;color:#0f1113 !important}";

  function txt(el) { return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : ""; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function read(host, card, i) {
    var q = function (a) { return a ? card.querySelector(a) : null; };
    var tEl = q(host.getAttribute("data-cv-title")), dEl = q(host.getAttribute("data-cv-desc")), iEl = q(host.getAttribute("data-cv-img") || "img");
    var badge = tEl && tEl.querySelector("span") ? txt(tEl.querySelector("span")) : "";
    var name = txt(tEl); if (badge && name.slice(-badge.length) === badge) name = name.slice(0, -badge.length).trim();
    var link = card.tagName === "A" ? card.getAttribute("href") : (q(host.getAttribute("data-cv-link")) || {}).href || "";
    var gets = [], ios = card.querySelector(".app-store-link,#app-store-link");
    if (ios) gets.push({ cls: "ios", href: ios.href, label: "App Store", ext: 1 });
    if (card.querySelector(".android-testers")) gets.push({ cls: "and", href: "", label: "Android beta", card: 1 });
    if (link && !gets.length) gets.push({ cls: "", href: link, label: host.getAttribute("data-cv-label") || "Open" });
    if (!card.id) card.id = "cv-card-" + i;
    return { card: card, name: name, badge: badge, desc: txt(dEl), img: iEl ? (iEl.currentSrc || iEl.src) : "", link: link, gets: gets };
  }

  function getsHtml(it) {
    return it.gets.map(function (g, k) {
      return g.card ? '<a class="cv-get" href="#' + it.card.id + '" data-cv-go="' + it.card.id + '">' + esc(g.label) + "</a>"
        : '<a class="cv-get ' + g.cls + '" href="' + esc(g.href) + '"' + (g.ext ? ' target="_blank" rel="noopener"' : "") + ">" + esc(g.label) + "</a>";
    }).join("");
  }
  function nameAttrs(it) { return it.link && it.card.tagName === "A" ? ' data-cv-href="' + esc(it.link) + '"' : ' data-cv-go="' + it.card.id + '"'; }
  function badge(it) { return it.badge ? '<span class="cv-badge">' + esc(it.badge) + "</span>" : ""; }

  function setup(host) {
    var key = host.getAttribute("data-card-views") || location.pathname;
    var items = [].slice.call(host.querySelectorAll(host.getAttribute("data-cv-item"))).map(function (c, i) { return read(host, c, i); });
    if (!items.length) return;
    host.classList.add("cv-host");
    var view = "cards";
    try { var v = localStorage.getItem("mes-cardviews:" + key); if (NAMES[v]) view = v; } catch (e) {}

    var row = document.createElement("div");
    row.className = "cv-row";
    row.innerHTML = '<span class="cv-lbl" id="cv-lbl-' + key + '">View:</span><div class="cv-views" role="group" aria-labelledby="cv-lbl-' + key + '">' +
      Object.keys(NAMES).map(function (k) { return '<button type="button" data-v="' + k + '" aria-pressed="false">' + ICON[k] + "<span>" + NAMES[k] + "</span></button>"; }).join("") + "</div>";
    var alt = document.createElement("div");
    alt.className = "cv-alt";
    host.parentNode.insertBefore(row, host);
    host.parentNode.insertBefore(alt, host);

    function render() {
      if (view === "list") {
        alt.innerHTML = '<div class="cv-list">' + items.map(function (it) {
          return '<div class="cv-li">' + (it.img ? '<img src="' + esc(it.img) + '" alt="" loading="lazy">' : "") +
            '<div class="cv-tx"><div><span class="cv-nm" role="link" tabindex="0"' + nameAttrs(it) + ">" + esc(it.name) + "</span>" + badge(it) + "</div>" +
            '<div class="cv-ds">' + esc(it.desc) + '</div></div><div class="cv-gets">' + getsHtml(it) + "</div></div>";
        }).join("") + "</div>";
      } else if (view === "compact") {
        alt.innerHTML = '<div class="cv-compact">' + items.map(function (it) {
          var href = it.gets.length && it.gets[0].ext ? it.gets[0].href : "";
          return '<button type="button" class="cv-pill"' + nameAttrs(it) + ' title="' + esc(it.name + (it.desc ? ": " + it.desc : "")) + '">' +
            (it.img ? '<img src="' + esc(it.img) + '" alt="" loading="lazy">' : "") + "<span>" + esc(it.name) + "</span></button>";
        }).join("") + "</div>";
      } else if (view === "table") {
        alt.innerHTML = '<div class="cv-tw"><table class="cv-table"><thead><tr><th>Name</th><th class="cv-td">What it does</th><th>' +
          esc(host.getAttribute("data-cv-label") ? "Open" : "Get it") + "</th></tr></thead><tbody>" + items.map(function (it) {
            return '<tr><td class="cv-tn"><div>' + (it.img ? '<img src="' + esc(it.img) + '" alt="" loading="lazy">' : "") +
              '<span><b role="link" tabindex="0"' + nameAttrs(it) + ">" + esc(it.name) + "</b>" + badge(it) + '</span></div></td><td class="cv-td">' + esc(it.desc) +
              '</td><td class="cv-tg">' + getsHtml(it) + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      } else alt.innerHTML = "";
      alt.hidden = view === "cards";
      host.classList.toggle("cv-off", view !== "cards");
      [].forEach.call(row.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === view ? "true" : "false"); });
    }
    function go(id) {
      view = "cards"; render();
      try { localStorage.setItem("mes-cardviews:" + key, view); } catch (e) {}
      var c = document.getElementById(id); if (!c) return;
      var d = c.querySelector("details.android-testers"); if (d) d.open = true;
      c.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    row.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-v]"); if (!b) return;
      view = b.getAttribute("data-v"); render();
      try { localStorage.setItem("mes-cardviews:" + key, view); } catch (e2) {}
    });
    function act(e) {
      var h = e.target.closest("[data-cv-href]"), g = e.target.closest("[data-cv-go]");
      if (h) { location.href = h.getAttribute("data-cv-href"); e.preventDefault(); }
      else if (g) { go(g.getAttribute("data-cv-go")); e.preventDefault(); }
    }
    alt.addEventListener("click", act);
    alt.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[role=link]")) act(e); });
    render();
  }

  function init() {
    var hosts = document.querySelectorAll("[data-card-views]");
    if (!hosts.length) return;
    if (!document.getElementById("cv-css")) { var st = document.createElement("style"); st.id = "cv-css"; st.textContent = CSS; document.head.appendChild(st); }
    [].forEach.call(hosts, setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
