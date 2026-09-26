/* Behaviour for the "More like this" side column (markup + CSS: add_sidebar.py, main_js/aside.css).

   1. Left/right button  -- toggles html.aside-left, remembered in localStorage ("asideSide"). The saved side is applied
      before first paint by a tiny inline script the page carries in <head>; this file only wires up the button.
   2. Ad slot            -- when the page's .mes-aside__ad has a real data-ad-slot (add_sidebar.py --ad-slot) and is actually
      visible (>= 1200px), inject the AdSense <ins> and push it. The adsbygoogle.js loader itself is the page's own
      deferred one; pushes made before it loads are queued by AdSense. Never requests an ad for a hidden slot.
      Add ?aside-debug to the URL to see a labelled placeholder box where the ad will go.
   3. Random card        -- appends one random related page (same family, not already listed) from aside-random.json. */
(function () {
    "use strict";
    var aside = document.getElementById("mes-aside");
    if (!aside) return;

    var AD_CLIENT = "ca-pub-1461238060884369";

    if (/[?&]aside-debug\b/.test(location.search)) document.documentElement.classList.add("aside-debug");

    /* 1. flip */
    var flip = aside.querySelector(".mes-aside__flip");
    if (flip) {
        flip.addEventListener("click", function () {
            var left = document.documentElement.classList.toggle("aside-left");
            try { localStorage.setItem("asideSide", left ? "left" : "right"); } catch (e) {}
        });
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
        var tries = 0, libTicks = 0, wired = false, timer;
        function tick() {
            tries++;
            var st = ins.getAttribute("data-ad-status");
            var lib = !!(window.adsbygoogle && window.adsbygoogle.loaded === true);
            if (lib) libTicks++;
            var el = document.querySelector('script[src*="adsbygoogle.js"]');
            if (el && !wired) { wired = true; el.addEventListener("error", function () { setCollapsed(true); }); }
            var cs = window.getComputedStyle(ins);
            var hidden = ins.offsetHeight === 0 || cs.display === "none" || cs.visibility === "hidden";
            if (st === "filled") { setCollapsed(false); if (tries > 3) return clearInterval(timer); return; }
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

    /* 2. ad */
    var ad = aside.querySelector(".mes-aside__ad");
    var adDone = false;
    function loadAd() {
        if (adDone || !ad) return;
        var slot = ad.getAttribute("data-ad-slot");
        if (!slot || !ad.offsetParent) return;
        adDone = true;
        var ins = document.createElement("ins");
        ins.className = "adsbygoogle";
        ins.style.cssText = "display:inline-block;width:300px;height:250px";
        ins.setAttribute("data-ad-client", AD_CLIENT);
        ins.setAttribute("data-ad-slot", slot);
        ad.appendChild(ins);
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
        watchAd(ins, function (gone) { ad.style.display = gone ? "none" : ""; });
    }
    if (ad && ad.getAttribute("data-ad-slot")) {
        loadAd();
        if (!adDone && window.matchMedia) {
            var mq = window.matchMedia("(min-width: 1200px)");
            var onChange = function () { loadAd(); };
            if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
        }
    }

    /* 3. random card */
    var list = aside.querySelector(".mes-aside__list");
    var family = aside.getAttribute("data-aside-family");
    if (list && family && window.fetch) {
        var start = function () {
            fetch("/main_js/aside-random.json?v=1").then(function (r) { return r.json(); }).then(function (data) {
                var items = data[family] || [];
                var have = {};
                have[location.pathname.replace(/\/$/, "")] = true;
                list.querySelectorAll("a.mes-aside__card").forEach(function (a) { have[a.getAttribute("href")] = true; });
                items = items.filter(function (it) { return !have[it.u]; });
                if (!items.length) return;
                var it = items[Math.floor(Math.random() * items.length)];
                var li = document.createElement("li");
                var a = document.createElement("a");
                a.className = "mes-aside__card";
                a.href = it.u;
                if (it.i) {
                    var img = document.createElement("img");
                    img.className = "mes-aside__img";
                    img.width = 56; img.height = 56; img.loading = "lazy"; img.alt = ""; img.src = it.i;
                    a.appendChild(img);
                }
                var text = document.createElement("span");
                text.className = "mes-aside__text";
                var name = document.createElement("span");
                name.className = "mes-aside__name";
                name.textContent = it.t;
                var tag = document.createElement("span");
                tag.className = "mes-aside__tag";
                tag.textContent = it.k;
                text.appendChild(name); text.appendChild(tag);
                a.appendChild(text);
                li.appendChild(a);
                list.appendChild(li);
            }).catch(function () {});
        };
        if (window.requestIdleCallback) requestIdleCallback(start, { timeout: 3000 }); else setTimeout(start, 1500);
    }
})();
