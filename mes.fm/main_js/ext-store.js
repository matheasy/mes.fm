/* Chrome Web Store buttons for the MES browser extensions (2026-11-08). Loaded by site-search.js only on pages that offer an
   extension zip (/<slug>/mes-*.zip) or on /browser. Reads /main_js/ext-store.json ({slug: store URL}; empty = not listed yet):
   - extension pages: an "Add to Brave / Chrome" button before the zip download (the zip stays as the manual way) and the
     "Until the extension is listed in the Chrome Web Store ..." sentence is replaced;
   - /browser: a small "Chrome Web Store" link after each of our tiles.
   The store works for Chrome, Brave, Edge, Opera, Vivaldi and other Chromium browsers. */
(function () {
    "use strict";
    if (window.__mesExtStore) return; window.__mesExtStore = 1;
    var NAME = { videospeed: "Video Speed Controller", "read-aloud": "Read Aloud", "dark-mode": "Dark Mode", "volume-booster": "Volume Booster", "text-size": "Text Size", archive: "Archive", "site-traffic": "Site Rank" };
    function css() {
        if (document.getElementById("mes-xs-css")) return;
        var s = document.createElement("style"); s.id = "mes-xs-css";
        s.textContent = ".mes-xs{display:inline-flex;align-items:center;gap:.5em;background:#1a73e8;color:#fff!important;border-radius:999px;padding:.55em 1.1em;font-weight:700;text-decoration:none!important;margin:0 .5em .4em 0}" +
            ".mes-xs:hover{background:#1557b0}.mes-xs svg{width:1.25em;height:1.25em;flex:none}.mes-xs-note{font-size:.9em;opacity:.85;margin:.2em 0 .6em}" +
            ".mes-xs-tag{display:inline-block;font-size:.8em;font-weight:600;margin-top:.3em;color:#1a73e8!important}body.dark-mode .mes-xs-tag{color:#8ab4f8!important}";
        document.head.appendChild(s);
    }
    var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#fff"/><path d="M12 7a5 5 0 0 1 4.33 2.5H22A10.5 10.5 0 0 0 3.3 6.3l2.9 5A5 5 0 0 1 12 7z" fill="#db4437"/><path d="M7.67 14.5 2.6 7.6A10.5 10.5 0 0 0 11 22.45l2.9-5A5 5 0 0 1 7.67 14.5z" fill="#0f9d58"/><path d="M16.33 9.5A5 5 0 0 1 14 17.4l-2.9 5A10.5 10.5 0 0 0 22.4 9.5z" fill="#ffcd40"/><circle cx="12" cy="12" r="3.6" fill="#4285f4"/></svg>';
    function run(map) {
        var page = (location.pathname.replace(/\/+$/, "").split("/")[1] || "");
        if (page === "browser") {
            Object.keys(NAME).forEach(function (slug) {
                if (!map[slug]) return;
                var re = new RegExp("^(https://mes\\.fm)?/" + slug + "(#extension)?$");
                var all = [].filter.call(document.querySelectorAll("a[href]"), function (a) { return re.test(a.getAttribute("href")); });
                var pick = all.filter(function (a) { return a.querySelector("img"); })[0] || all[0];
                [pick].forEach(function (a) {
                    if (!a || a.dataset.xs) return;
                    a.dataset.xs = 1; css();
                    /* the tile is itself a link, so the tag is a span inside it that opens the store (no nested <a>) */
                    var t = document.createElement("span"); t.className = "mes-xs-tag"; t.setAttribute("role", "link"); t.tabIndex = 0;
                    t.textContent = "In the Chrome Web Store"; t.dataset.href = map[slug];
                    function go(e) { e.preventDefault(); e.stopPropagation(); window.open(map[slug], "_blank", "noopener"); }
                    t.addEventListener("click", go);
                    t.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") go(e); });
                    if (a.querySelector("img")) { t.style.display = "block"; t.style.textDecoration = "underline"; a.appendChild(t); }
                    else a.parentNode.insertBefore(t, a.nextSibling);
                });
            });
            return;
        }
        var url = map[page]; if (!url) return;
        var dl = document.querySelector('a[href^="/' + page + '/mes-"][href*=".zip"]'); if (!dl || document.querySelector(".mes-xs")) return;
        css();
        var b = document.createElement("a"); b.className = "mes-xs"; b.href = url; b.target = "_blank"; b.rel = "noopener";
        b.innerHTML = ICON + "<span>Add to Brave / Chrome</span>";
        b.title = "Install MES " + (NAME[page] || "") + " from the Chrome Web Store (works in Chrome, Brave, Edge and other Chromium browsers)";
        dl.parentNode.insertBefore(b, dl);
        dl.classList.remove("tu-btn--primary"); dl.classList.add("tu-btn--ghost");
        var note = document.createElement("p"); note.className = "mes-xs-note";
        note.textContent = "From the Chrome Web Store it installs in one click and updates itself. The zip below is the manual way (Developer mode).";
        var row = dl.closest(".tu-row") || dl.parentNode; row.parentNode.insertBefore(note, row.nextSibling);
        [].forEach.call(document.querySelectorAll("p.tu-note"), function (p) {
            if (/Until the extension is listed in the Chrome Web Store/.test(p.textContent))
                p.textContent = "This is the manual install. The easy way is the Add to Brave / Chrome button above: the store version updates by itself. Firefox is not supported yet.";
        });
    }
    fetch("/main_js/ext-store.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : {}; }).then(run).catch(function () {});
})();
