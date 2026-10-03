/* Options for the fixed "Jump to" sidebar TOC (.toc-sidebar): pills under its title -- Side (move it to the other side of the
   article) and Hide (collapse the sidebar to a "Jump to" tab where it was; click the tab to bring it back) -- plus a Wide / Narrow
   pill at the top right of the article (inside the "Part of ..." box when the page has one, else on a row above the <h1>; the same spot as on the calculator pages). Wide widens the article column and
   the sidebar moves out with it. Saved in localStorage ("asideSide", "pageWide" / "pageMode" -- both shared with the "More like this" pages --
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
    /* Standard | Wide | Theatre switch (the sidebar stays in all three; theatre just gives the article most of the window) */
    var wide = document.createElement("div");
    wide.className = "toc-wide-pill toc-mode";
    wide.setAttribute("role", "group");
    wide.setAttribute("aria-label", "Page width");
    var MODES = [["std", "Standard", "Normal article width"], ["wide", "Wide", "Widen the article"], ["theatre", "Theatre", "Use most of the window for the article (the Jump to sidebar stays)"]], mbtn = {};
    function current() { return root.classList.contains("page-theatre") ? "theatre" : root.classList.contains("page-wide") ? "wide" : "std"; }
    function setMode(m) {
        root.classList.toggle("page-wide", m !== "std");
        root.classList.toggle("page-theatre", m === "theatre");
        save("pageMode", m); save("pageWide", m === "std" ? "0" : "1");
        paint();
        try { window.dispatchEvent(new Event("resize")); } catch (e) {}
    }
    MODES.forEach(function (x) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = x[1]; b.title = x[2];
        b.addEventListener("click", function () { setMode(x[0]); });
        mbtn[x[0]] = b; wide.appendChild(b);
    });
    var hide = pill("Hide &#8250;", "Hide this sidebar", function () {
        root.classList.add("toc-hidden");
        save("tocHidden", "1");
        window.dispatchEvent(new Event("resize")); /* lets jump-to.js show its floating-bar button */
    });
    function paint() {
        var m = current();
        MODES.forEach(function (x) { mbtn[x[0]].setAttribute("aria-pressed", x[0] === m ? "true" : "false"); });
    }
    paint();
    tools.appendChild(side); tools.appendChild(hide);
    var h1 = document.querySelector(".container > h1");
    var partOf = h1 && document.querySelector(".container > .part-of");
    if (partOf && partOf.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING) {
        /* same line as the "Part of ..." box, at its right end: matches the calculator pages and costs no vertical space */
        partOf.classList.add("toc-has-wide");
        partOf.appendChild(wide);
    } else if (h1) {
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
    /* in the width switch (when it sits in the article header) the tab is a segment of it, shown only while the list is hidden;
       otherwise (switch inside the sidebar itself) it stays a floating tab where the sidebar was */
    if (wide.parentNode === nav || nav.contains(wide)) document.body.appendChild(reopen);
    else wide.insertBefore(reopen, wide.firstChild);
})();
