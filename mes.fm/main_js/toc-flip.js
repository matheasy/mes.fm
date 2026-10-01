/* Options for the fixed "Jump to" sidebar TOC (.toc-sidebar): pills under its title -- Side (move it to the other side of the
   article) and Hide (collapse the sidebar to a "Jump to" tab where it was; click the tab to bring it back) -- plus a Wide / Narrow
   pill at the top right of the article, before the <h1> (the same spot as on the calculator pages). Wide widens the article column and
   the sidebar moves out with it. Saved in localStorage ("asideSide", "pageWide" -- both shared with the "More like this" pages --
   and "tocHidden"), restored before first paint by the inline script in <head> (add_toc_flip.py); layout: main_js/toc-flip.css. */
(function () {
    "use strict";
    var nav = document.querySelector(".toc-sidebar");
    if (!nav || nav.querySelector(".toc-tools")) return;
    var root = document.documentElement;
    function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function pill(label, title, onClick) {
        var b = document.createElement("button");
        b.type = "button";
        b.title = title;
        b.innerHTML = label;
        b.addEventListener("click", onClick);
        return b;
    }
    var tools = document.createElement("div");
    tools.className = "toc-tools";
    var side = pill("&#8644; Side", "Move this sidebar to the other side", function () {
        save("asideSide", root.classList.toggle("aside-left") ? "left" : "right");
    });
    var wide = pill("", "Widen the page", function () {
        save("pageWide", root.classList.toggle("page-wide") ? "1" : "0");
        paint();
    });
    wide.className = "toc-wide-pill"; /* lives at the top right of the article (before the <h1>), like the calculator pages' Wide button */
    var hide = pill("Hide &#8250;", "Hide this sidebar", function () {
        root.classList.add("toc-hidden");
        save("tocHidden", "1");
        window.dispatchEvent(new Event("resize")); /* lets jump-to.js show its floating-bar button */
    });
    function paint() {
        var on = root.classList.contains("page-wide");
        wide.setAttribute("aria-pressed", on ? "true" : "false");
        wide.innerHTML = "&#8596; " + (on ? "Narrow" : "Wide");
        wide.title = on ? "Back to the standard width" : "Widen the page";
    }
    paint();
    tools.appendChild(side); tools.appendChild(hide);
    var h1 = document.querySelector(".container > h1");
    if (h1) {
        var row = document.createElement("div");
        row.className = "toc-wide-row";
        row.appendChild(wide);
        h1.parentNode.insertBefore(row, h1);
    } else tools.insertBefore(wide, hide); /* no title to sit beside: keep it in the sidebar */
    var header = nav.querySelector(".toc-sidebar-header") || (nav.querySelector(".toc-title") || {}).parentNode;
    if (header && header !== nav) header.parentNode.insertBefore(tools, header.nextSibling);
    else (nav.querySelector(".toc-title") || nav.firstChild).insertAdjacentElement("afterend", tools);

    var reopen = document.createElement("button");
    reopen.type = "button";
    reopen.className = "toc-reopen";
    reopen.title = "Show the Jump to sidebar";
    reopen.innerHTML = "&#8249; Jump to";
    reopen.addEventListener("click", function () {
        root.classList.remove("toc-hidden");
        save("tocHidden", "0");
        window.dispatchEvent(new Event("resize"));
    });
    document.body.appendChild(reopen);
})();
