/* Adds a left/right switch button next to the "Jump to" title of the fixed sidebar TOC (.toc-sidebar).
   The saved side (localStorage "asideSide", shared with the "More like this" column) is applied before first paint by a
   tiny inline script in <head> (see add_toc_flip.py); the layout rules are main_js/toc-flip.css. */
(function () {
    "use strict";
    var nav = document.querySelector(".toc-sidebar");
    if (!nav || nav.querySelector(".toc-flip")) return;
    var title = nav.querySelector(".toc-title");
    if (!title) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toc-flip";
    btn.setAttribute("aria-label", "Move this sidebar to the other side");
    btn.title = "Move sidebar to the other side";
    btn.innerHTML = "&#8644;";
    btn.addEventListener("click", function () {
        var left = document.documentElement.classList.toggle("aside-left");
        try { localStorage.setItem("asideSide", left ? "left" : "right"); } catch (e) {}
    });
    var group = document.createElement("div");
    group.className = "toc-head-left";
    title.parentNode.insertBefore(group, title);
    group.appendChild(title);
    group.appendChild(btn);
    /* a header-less TOC (title straight inside the nav): give the group its own row */
    if (group.parentNode === nav) group.style.marginBottom = ".7em";
})();
