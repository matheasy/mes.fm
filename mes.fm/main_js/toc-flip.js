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

/* Resizable "Jump to" sidebar (2026-10-30): a handle on the sidebar's INNER edge (the side facing the article; it follows the
   sidebar when it flips sides). Drag it (mouse, touch, pen), or focus it and use Left / Right (Shift = bigger steps), Home / End
   (narrowest / widest); Enter or a double-click goes back to the standard 210px. The width is the CSS variable --toc-swp on <html>
   (toc-flip.css keeps it between 180px and what still leaves the article ~600px, and moves / shrinks the article and the "More
   like this" rail instead of covering them), saved for every page in localStorage "tocWidth" and restored before first paint by
   the TOC-FLIP-HEAD inline script. */
(function () {
    "use strict";
    var nav = document.querySelector(".toc-sidebar");
    if (!nav || document.querySelector(".toc-resize")) return;
    var root = document.documentElement, DEF = 210, MIN = 180;
    var h = document.createElement("div");
    h.className = "toc-resize";
    h.tabIndex = 0;
    h.setAttribute("role", "separator");
    h.setAttribute("aria-orientation", "vertical");
    h.setAttribute("aria-label", "Resize the Jump to sidebar");
    h.title = "Drag to make the Jump to list wider or narrower (double-click: standard width)";
    document.body.appendChild(h);
    function left() { return root.classList.contains("aside-left"); }
    function width() { return Math.round(parseFloat(getComputedStyle(nav).width) || DEF); }
    function maxW() {   /* same limit as toc-flip.css: min(520px, 100vw - 670px - room on the other side) */
        var o = parseFloat(getComputedStyle(root).getPropertyValue("--toc-o")) || 20;
        return Math.max(MIN, Math.min(520, Math.round(window.innerWidth - 670 - o)));
    }
    function setW(px, save) {
        px = Math.round(Math.max(MIN, Math.min(maxW(), px)));
        root.style.setProperty("--toc-swp", px + "px");
        if (save) { try { if (px === DEF) localStorage.removeItem("tocWidth"); else localStorage.setItem("tocWidth", String(px)); } catch (e) {} }
        place();
        return px;
    }
    function done() { place(); try { window.dispatchEvent(new Event("resize")); } catch (e) {} }
    function reset() {
        root.style.removeProperty("--toc-swp");
        try { localStorage.removeItem("tocWidth"); } catch (e) {}
        done();
    }
    function place() {
        var r = nav.getBoundingClientRect();
        var shown = r.width > 0 && r.height > 0 && !root.classList.contains("toc-hidden");
        h.classList.toggle("on", shown);
        if (!shown) return;
        /* the inner edge: the sidebar's left border when it is right of the article, its right border when it is left of it */
        h.style.left = (left() ? r.right : r.left) + "px";
        h.style.top = r.top + "px";
        h.style.height = Math.max(40, r.height) + "px";
        var w = width();
        h.setAttribute("aria-valuenow", String(w));
        h.setAttribute("aria-valuemin", String(MIN));
        h.setAttribute("aria-valuemax", String(maxW()));
        h.setAttribute("aria-valuetext", w + " pixels wide");
    }
    /* dragging: the width follows the pointer; the article re-lays out once per frame at most */
    var drag = null, raf = 0, pending = 0;
    h.addEventListener("pointerdown", function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        drag = { x: e.clientX, w: width(), id: e.pointerId };
        pending = 0;
        try { h.setPointerCapture(e.pointerId); } catch (x) {}
        h.classList.add("drag"); root.classList.add("toc-resizing");
    });
    h.addEventListener("pointermove", function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.x;
        pending = drag.w + (left() ? dx : -dx);
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (pending) setW(pending, false); });
    });
    function end(e) {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (pending && Math.abs(pending - drag.w) >= 1) setW(pending, true);
        drag = null; pending = 0;
        h.classList.remove("drag"); root.classList.remove("toc-resizing");
        done();
    }
    h.addEventListener("pointerup", end);
    h.addEventListener("pointercancel", end);
    h.addEventListener("lostpointercapture", end);
    h.addEventListener("dblclick", function (e) { e.preventDefault(); reset(); });
    h.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? 48 : 16, w = width(), k = e.key, n = null;
        /* arrows move the edge itself: on a right-hand sidebar Left makes it wider, on a left-hand one Right does */
        if (k === "ArrowLeft") n = w + (left() ? -step : step);
        else if (k === "ArrowRight") n = w + (left() ? step : -step);
        else if (k === "Home") n = MIN;
        else if (k === "End") n = maxW();
        else if (k === "Enter" || k === " ") { e.preventDefault(); reset(); return; }
        if (n === null) return;
        e.preventDefault();
        setW(n, true); done();
    });
    /* keep the handle on the edge: window size, side / mode / hide changes, the sidebar's own height changing */
    var q = 0;
    function later() { if (!q) q = requestAnimationFrame(function () { q = 0; if (!drag) place(); }); }
    window.addEventListener("resize", later);
    window.addEventListener("scroll", later, { passive: true });
    new MutationObserver(function () { if (!drag) place(); }).observe(root, { attributes: true, attributeFilter: ["class"] });
    if (window.ResizeObserver) new ResizeObserver(later).observe(nav);
    place();
    setTimeout(place, 300);
    setTimeout(place, 1200);
})();
