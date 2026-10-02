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

    /* 1. flip + hide */
    var flip = aside.querySelector(".mes-aside__flip");
    var hideBtn = null;
    if (flip) {
        flip.addEventListener("click", function () {
            var left = document.documentElement.classList.toggle("aside-left");
            try { localStorage.setItem("asideSide", left ? "left" : "right"); } catch (e) {}
        });
        /* hide button next to it (>= 1200px, same visibility rules as the flip); "Show sidebar" lives in the width switch (2b) */
        var tools = document.createElement("span");
        tools.className = "mes-aside__tools";
        flip.parentNode.insertBefore(tools, flip);
        tools.appendChild(flip);
        hideBtn = document.createElement("button");
        hideBtn.type = "button";
        hideBtn.className = "mes-aside__hide";
        hideBtn.setAttribute("aria-label", "Hide this sidebar");
        hideBtn.title = "Hide this sidebar (bring it back with “Show sidebar” at the top right of the page)";
        hideBtn.innerHTML = "&#8250;";
        hideBtn.addEventListener("click", function () {
            document.documentElement.classList.add("aside-hidden");
            try { localStorage.setItem("asideHidden", "1"); } catch (e) {}
            try { window.dispatchEvent(new Event("resize")); } catch (e) {}
        });
        tools.appendChild(hideBtn);
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
        var rzTimer;   /* the slot can become visible later (window resized past a Wide / Theatre breakpoint) */
        window.addEventListener("resize", function () { clearTimeout(rzTimer); rzTimer = setTimeout(loadAd, 300); });
        loadAd();
        if (!adDone && window.matchMedia) {
            var mq = window.matchMedia("(min-width: 1200px)");
            var onChange = function () { loadAd(); };
            if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
        }
    }

    /* 2b. page width -- a "Standard | Wide | Theatre" switch (>= 1200px only) at the right end of the content column's title row.
       Wide = html.page-wide: one column (content ~1070px), the ad dropped, the "More like this" cards as a grid below the content.
       Theatre = html.page-wide + html.page-theatre: the same, but the page uses nearly the whole window (calendar year view, wide tables, videos).
       Saved in localStorage "pageMode" (std | wide | theatre) and, for the older head scripts, "pageWide" ("1" for wide and theatre); both are
       restored before first paint by the page's <head> script (rules: aside.css). Going back to Standard brings the ad slot back, so request it
       then (it is never requested while hidden). */
    var host = document.querySelector(".has-aside .page-content") || document.querySelector(".mes-col-main");
    if (host && !host.querySelector(".mes-wide-toggle")) {
        var root = document.documentElement;
        var group = document.createElement("div");
        group.className = "mes-wide-toggle mes-mode";
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", "Page width");
        var MODES = [["std", "Standard", "Normal width, sidebar beside the content"], ["wide", "Wide", "Use the full page width; the sidebar moves below the content"], ["theatre", "Theatre", "Use nearly the whole window: best for big screens, wide tables and the full-year calendar"]];
        var buttons = {};
        var current = function () { return root.classList.contains("page-theatre") ? "theatre" : root.classList.contains("page-wide") ? "wide" : "std"; };
        var paint = function () {
            var m = current();
            MODES.forEach(function (x) { buttons[x[0]].setAttribute("aria-pressed", x[0] === m ? "true" : "false"); });
        };
        var setMode = function (m) {
            root.classList.toggle("page-wide", m !== "std");
            root.classList.toggle("page-theatre", m === "theatre");
            try { localStorage.setItem("pageMode", m); localStorage.setItem("pageWide", m === "std" ? "0" : "1"); } catch (e) {}
            paint();
            loadAd();   /* no-op unless the ad slot is visible: Standard always, Wide from 1560px, Theatre from 1900px (aside.css) */
            try { window.dispatchEvent(new Event("resize")); } catch (e) {}
        };
        MODES.forEach(function (x) {
            var b = document.createElement("button");
            b.type = "button"; b.textContent = x[1]; b.title = x[2];
            b.addEventListener("click", function () { setMode(x[0]); });
            buttons[x[0]] = b; group.appendChild(b);
        });
        var show = document.createElement("button");
        show.type = "button"; show.className = "mes-aside-show"; show.textContent = "Show sidebar"; show.title = "Bring the sidebar back";
        show.addEventListener("click", function () {
            root.classList.remove("aside-hidden");
            try { localStorage.setItem("asideHidden", "0"); } catch (e) {}
            loadAd();
            try { window.dispatchEvent(new Event("resize")); } catch (e) {}
        });
        group.appendChild(show);
        paint();
        host.insertBefore(group, host.firstChild);
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
    /* 4. cross recommendations -- calculator / meme / puzzle / tool pages send people to the math video tutorials, and the math-hub article pages
       send them to the calculators (pools: aside-recs.json, built by build_aside_recs.py). The column is filled with as many extra cards as it
       takes to reach the height of the content next to it (at least 3, at most 12); when the sidebar sits below the content (< 1200px, or Wide /
       Theatre without room) just one row of four. Not shown on the 9/11 / Hutchison / science / conspiracy / crypto mirrors. */
    (function () {
        var MATH_FAMS = { "math-qa": 1, "cubic-formula": 1, "vector-functions-problems-plus": 1, "math": 1 };
        var NONE = { "911": 1, "hutchison": 1, "science": 1, "conspiracy": 1, "crypto": 1, "mathiew": 1, "livestreams": 1 };
        if (!family || NONE[family] || !window.fetch) return;
        var pool = MATH_FAMS[family] ? "calc" : "math";
        var heading = pool === "math" ? "Free math video tutorials" : "Free calculators";
        var host2 = aside.querySelector(".mes-aside__sticky") || aside;
        function card(it) {
            var li = document.createElement("li"), a = document.createElement("a");
            a.className = "mes-aside__card"; a.href = it.u;
            if (it.i) {
                var img = document.createElement("img");
                img.className = "mes-aside__img" + (pool === "calc" ? " mes-aside__img--logo" : "");
                img.width = 56; img.height = 56; img.loading = "lazy"; img.alt = ""; img.src = it.i;
                a.appendChild(img);
            }
            var text = document.createElement("span"), name = document.createElement("span"), tag = document.createElement("span");
            text.className = "mes-aside__text"; name.className = "mes-aside__name"; tag.className = "mes-aside__tag";
            name.textContent = it.t; tag.textContent = it.k;
            text.appendChild(name); text.appendChild(tag); a.appendChild(text); li.appendChild(a);
            return li;
        }
        function build(data) {
            var items = (data[pool] || []).slice(), have = {};
            have[location.pathname.replace(/\/$/, "").replace(/\/index\.html$/, "")] = true;
            aside.querySelectorAll("a.mes-aside__card").forEach(function (a) { have[a.getAttribute("href")] = true; });
            items = items.filter(function (it) { return !have[it.u]; });
            if (!items.length) return;
            for (var i = items.length - 1; i > 0; i--) { var k = Math.floor(Math.random() * (i + 1)), t = items[i]; items[i] = items[k]; items[k] = t; }
            var box = document.createElement("div"), h = document.createElement("h2"), ul = document.createElement("ul");
            box.className = "mes-aside__more"; h.className = "mes-aside__title-h"; h.textContent = heading; ul.className = "mes-aside__list";
            box.appendChild(h); box.appendChild(ul); host2.appendChild(box);
            var content = document.querySelector(".has-aside .page-content") || document.querySelector(".mes-col-main");
            function beside() { var a = aside.getBoundingClientRect(), c = content && content.getBoundingClientRect(); return !!c && window.innerWidth >= 1200 && (a.left >= c.right - 5 || a.right <= c.left + 5); }
            var n = 0;
            if (beside()) {
                while (n < items.length && n < 12 && (n < 3 || host2.getBoundingClientRect().height < content.getBoundingClientRect().height - 140)) { ul.appendChild(card(items[n])); n++; }
            } else {
                for (; n < Math.min(4, items.length); n++) ul.appendChild(card(items[n]));
            }
        }
        var go = function () { fetch("/main_js/aside-recs.json?v=1").then(function (r) { return r.json(); }).then(build).catch(function () {}); };
        if (document.readyState === "complete") go(); else window.addEventListener("load", go);
    })();
})();
