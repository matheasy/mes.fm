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
    /* Blocker detection that doesn't wait for the (deferred) AdSense loader: (1) a capture-phase listener sees the loader <script>
       fail, however fast that happens (a poll can miss the error event); (2) a bait <div> carrying the classes ad-block cosmetic
       filters hide (Brave Shields, uBlock, AdGuard) -- if it is hidden after a moment, ads are blocked. */
    function watchBlocked(setCollapsed) {
        window.addEventListener("error", function (e) {
            var t = e.target;
            if (t && t.tagName === "SCRIPT" && /adsbygoogle\.js/.test(t.src || "")) setCollapsed(true);
        }, true);
        var bait = document.createElement("div");
        bait.className = "adsbox ad-banner ad-placement textAd pub_300x250 pub_728x90";
        bait.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:10px;height:10px;";
        document.body.appendChild(bait);
        setTimeout(function () {
            var cs = window.getComputedStyle(bait);
            if (bait.offsetHeight === 0 || cs.display === "none" || cs.visibility === "hidden") setCollapsed(true);
            if (bait.parentNode) bait.parentNode.removeChild(bait);
        }, 400);
    }

    function watchAd(ins, setCollapsed) {
        watchBlocked(setCollapsed);
        var tries = 0, libTicks = 0, fakeTicks = 0, wired = false, timer;
        function tick() {
            tries++;
            var st = ins.getAttribute("data-ad-status");
            var lib = !!(window.adsbygoogle && window.adsbygoogle.loaded === true);
            if (lib) libTicks++;
            var el = document.querySelector('script[src*="adsbygoogle.js"]');
            if (el && !wired) { wired = true; el.addEventListener("error", function () { setCollapsed(true); }); }
            var cs = window.getComputedStyle(ins);
            var hidden = ins.offsetHeight === 0 || cs.display === "none" || cs.visibility === "hidden";
            /* Brave Shields / uBlock answer with a stand-in that sets data-ad-status="filled" and adds an EMPTY <iframe>
               (no src, default 300x150) to look like a served ad, so "filled" only counts when the iframe is a real ad frame. */
            var fr = ins.querySelector("iframe");
            var real = st === "filled" && fr && (fr.getAttribute("src") || fr.getAttribute("srcdoc") || fr.hasAttribute("data-google-container-id"));
            if (real) { fakeTicks = 0; setCollapsed(false); if (tries > 3) return clearInterval(timer); return; }
            if (st === "filled" && ++fakeTicks >= 3) { setCollapsed(true); return; }
            if (st === "unfilled") { setCollapsed(true); return clearInterval(timer); }
            /* No verdict from AdSense. A real adsbygoogle.js answers within a second or two of starting, so silence after it
               has "loaded" means it is a blocker's stand-in (uBlock swaps in a stub that sets adsbygoogle.loaded and adds 1px
               iframes but never sets data-ad-status); silence without it means it was blocked outright or the <ins> was hidden. */
            if (lib && libTicks >= 6) setCollapsed(true);
            else if (tries >= 25 && hidden) setCollapsed(true);
            else if (tries >= 20 && !lib) setCollapsed(true);
            if (tries >= 45) clearInterval(timer);
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
