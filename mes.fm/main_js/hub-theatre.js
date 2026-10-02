/* Standard | Theatre switch for the hub pages (see hub-theatre.css). Saves localStorage "pageMode" (and "pageWide" for older scripts), shared with the
   Standard | Wide | Theatre switch on the sidebar pages. */
(function () {
    "use strict";
    var host = document.querySelector(".outer-page-content .page-content");
    if (!host || host.querySelector(".hub-mode")) return;
    var root = document.documentElement;
    var group = document.createElement("div");
    group.className = "hub-mode";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Page width");
    var MODES = [["std", "Standard", "Normal page width"], ["theatre", "Theatre", "Use nearly the whole window: more columns on big screens"]], btn = {};
    function paint() { var t = root.classList.contains("page-theatre"); MODES.forEach(function (x) { btn[x[0]].setAttribute("aria-pressed", String((x[0] === "theatre") === t)); }); }
    MODES.forEach(function (x) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = x[1]; b.title = x[2];
        b.addEventListener("click", function () {
            var on = x[0] === "theatre";
            root.classList.toggle("page-theatre", on);
            try { localStorage.setItem("pageMode", x[0]); localStorage.setItem("pageWide", on ? "1" : "0"); } catch (e) {}
            paint();
            try { window.dispatchEvent(new Event("resize")); } catch (e) {}
        });
        btn[x[0]] = b; group.appendChild(b);
    });
    paint();
    host.insertBefore(group, host.firstChild);
})();
