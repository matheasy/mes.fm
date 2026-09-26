/* Loads the 300x250 "Bottom" AdSense unit that add_bottom_ad.py puts after the Comments block, just above the footer.

   The container (.mes-bottom-ad, with a reserved height so nothing jumps) is in the page's HTML; the <ins> is only
   created -- and the ad only requested -- once the container is within ~300px of the viewport. A unit at the very end of a
   page that nobody scrolls to would otherwise be requested and never seen, which drags viewability down for everything
   else. adsbygoogle.js itself is the page's own deferred loader; pushes made before it arrives are queued by AdSense. */
(function () {
    "use strict";
    var AD_CLIENT = "ca-pub-1461238060884369";
    var boxes = document.querySelectorAll(".mes-bottom-ad[data-ad-slot]");
    if (!boxes.length) return;

    function load(box) {
        if (box.getAttribute("data-loaded")) return;
        var slot = box.getAttribute("data-ad-slot");
        var holder = box.querySelector(".mes-bottom-ad__slot");
        if (!slot || !holder || !box.offsetParent) return;
        box.setAttribute("data-loaded", "1");
        var ins = document.createElement("ins");
        ins.className = "adsbygoogle";
        ins.style.cssText = "display:inline-block;width:300px;height:250px";
        ins.setAttribute("data-ad-client", AD_CLIENT);
        ins.setAttribute("data-ad-slot", slot);
        holder.appendChild(ins);
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
        watchAd(ins, function (gone) { box.style.display = gone ? "none" : ""; });
    }


    /* Collapse the box when the ad can't show (ad blocker, or AdSense answered "unfilled") instead of leaving a blank hole,
       and bring it back if a fill arrives late. Polls for up to ~30s: an ad blocker either kills adsbygoogle.js (the script
       errors / never sets adsbygoogle.loaded) or hides the <ins> (zero size); AdSense marks a no-fill with
       data-ad-status="unfilled". The page's deferred loader can take up to 15s to start, hence the long deadline. */
    function watchAd(ins, setCollapsed) {
        var tries = 0, wired = false, timer;
        function tick() {
            tries++;
            var st = ins.getAttribute("data-ad-status");
            var lib = window.adsbygoogle && window.adsbygoogle.loaded === true;
            var el = document.querySelector('script[src*="adsbygoogle.js"]');
            if (el && !wired) { wired = true; el.addEventListener("error", function () { setCollapsed(true); }); }
            var hidden = ins.offsetHeight === 0 || window.getComputedStyle(ins).display === "none";
            if (st === "filled") { setCollapsed(false); if (tries > 3) return clearInterval(timer); return; }
            if (st === "unfilled") { setCollapsed(true); return clearInterval(timer); }
            if (tries >= 6 && hidden && (lib || tries >= 25)) setCollapsed(true);
            else if (tries >= 30 && !lib) setCollapsed(true);
            if (tries >= 40) clearInterval(timer);
        }
        timer = setInterval(tick, 1000);
    }

    Array.prototype.forEach.call(boxes, function (box) {
        if (!("IntersectionObserver" in window)) { load(box); return; }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { io.disconnect(); load(box); }
            });
        }, { rootMargin: "300px 0px" });
        io.observe(box);
    });
})();
