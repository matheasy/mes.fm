/* MES video speed bar (2026-11-17): "− 1.00× +" buttons under every .video-embed on the mirror / Q/A / cubic-formula pages, like
   the speed buttons of mes.fm/watch. A click steps 0.05 (snapped to the 0.05 grid), press and hold repeats, a click on the speed
   goes back to 1×. Works for our own <video> players (3Speak via hls.js, files) and YouTube embeds (postMessage to the player, so
   the iframe gets enablejsapi=1; YouTube's own player stops at 2×). The speed is remembered site-wide (localStorage mes-vspeed) and
   put back on every video, also after the 3Speak player swaps itself for the YouTube embed. Other sites' iframes (Odysee, Rumble ...)
   can't be controlled from the page, so they get no bar. Loaded by site-search.js on pages that have a .video-embed. */
(function () {
    "use strict";
    if (window.MESVideoSpeed) return;
    var KEY = "mes-vspeed", MAX = 16, YTMAX = 2, rate = 1;
    try { rate = parseFloat(localStorage.getItem(KEY)) || 1; } catch (e) {}
    rate = clamp(rate);
    var bars = [];

    function clamp(r) { return Math.round(Math.max(0.25, Math.min(MAX, r)) * 100) / 100; }
    function isYT(f) { return f && f.tagName === "IFRAME" && /^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\//.test(f.src || f.getAttribute("src") || ""); }
    function player(box) {
        var v = box.querySelector("video"); if (v) return { kind: "video", el: v };
        var f = [].filter.call(box.querySelectorAll("iframe"), isYT)[0]; if (f) return { kind: "yt", el: f };
        return null;
    }
    function ytPrep(f) {
        var s = f.getAttribute("src") || "";
        if (/[?&]enablejsapi=1/.test(s)) return;
        s += (s.indexOf("?") < 0 ? "?" : "&") + "enablejsapi=1&origin=" + encodeURIComponent(location.origin);
        f.setAttribute("src", s);
        f.addEventListener("load", function () { ytListen(f); ytRate(f); });
    }
    function ytPost(f, msg) { try { f.contentWindow.postMessage(JSON.stringify(msg), "*"); } catch (e) {} }
    function ytListen(f) { ytPost(f, { event: "listening", id: f.id || "mesvs", channel: "widget" }); }
    function ytRate(f) { ytPost(f, { event: "command", func: "setPlaybackRate", args: [Math.min(YTMAX, rate)] }); }
    function shown(p) { return p && p.kind === "yt" ? Math.min(YTMAX, rate) : rate; }

    function apply(b) {
        var p = player(b.box); b.p = p;
        b.bar.hidden = !p;
        if (!p) return;
        if (p.kind === "video") {
            try { p.el.defaultPlaybackRate = rate; p.el.playbackRate = rate; } catch (e) {}
            if (!p.el.__mesvs) {
                p.el.__mesvs = 1;
                // a new source (hls.js load, swap) resets the speed on some browsers: put it back
                ["loadedmetadata", "play"].forEach(function (ev) { p.el.addEventListener(ev, function () { if (Math.abs(p.el.playbackRate - rate) > 0.001) try { p.el.playbackRate = rate; } catch (e) {} }); });
                p.el.addEventListener("ratechange", function () { var r = clamp(p.el.playbackRate); if (Math.abs(r - rate) > 0.001 && r > 0) { rate = r; save(); paintAll(); } });
            }
        } else {
            ytPrep(p.el); ytRate(p.el);
        }
        paint(b);
    }
    function paint(b) {
        var r = shown(b.p);
        b.val.textContent = r.toFixed(2) + "×";
        b.val.title = "Back to normal speed (1×)";
        b.bar.title = b.p && b.p.kind === "yt" ? "Speed (YouTube's embedded player goes up to 2×)" : "Speed";
        b.faster.disabled = b.p && b.p.kind === "yt" ? rate >= YTMAX : rate >= MAX;
        b.slower.disabled = rate <= 0.25;
    }
    function paintAll() { bars.forEach(paint); }
    function save() { try { if (rate === 1) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(rate)); } catch (e) {} }
    function setRate(r) { rate = clamp(r); save(); bars.forEach(apply); }
    function step(b, dir) {
        var base = shown(b.p), q = base / 0.05, n = dir > 0 ? Math.floor(q + 1e-6) + 1 : Math.ceil(q - 1e-6) - 1;
        setRate(n * 0.05);
    }

    // press and hold = repeat (after 380 ms, then every 90 ms, faster after 1.5 s); the click after a press is swallowed so it
    // doesn't step twice, but a keyboard Enter / Space (click with detail 0) still steps once
    function holdRepeat(btn, fn) {
        var tmr = 0, t0 = 0, eat = false;
        function stop() { clearTimeout(tmr); tmr = 0; }
        function tick() { fn(); tmr = setTimeout(tick, Date.now() - t0 > 1500 ? 45 : 90); }
        btn.addEventListener("pointerdown", function (e) {
            if (btn.disabled || (e.button && e.button !== 0)) return;
            stop(); eat = true; t0 = Date.now(); fn(); tmr = setTimeout(tick, 380);
            try { btn.setPointerCapture(e.pointerId); } catch (x) {}
        });
        ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { btn.addEventListener(ev, stop); });
        btn.addEventListener("click", function (e) { if (eat && e.detail !== 0) { eat = false; return; } fn(); });
        btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }

    function css() {
        if (document.getElementById("mes-vspeed-css")) return;
        var s = document.createElement("style"); s.id = "mes-vspeed-css";
        s.textContent =
            ".mes-vspeed{display:flex;justify-content:flex-end;align-items:center;gap:.4em;margin:-.7em 0 1.1em;font:14px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#555}" +
            ".mes-vspeed[hidden]{display:none}" +
            ".mes-vspeed__lab{font-size:.9em;opacity:.85}" +
            ".mes-vspeed__g{display:inline-flex;border:1px solid #c9ced6;border-radius:999px;overflow:hidden;background:#fff}" +
            ".mes-vspeed button{all:unset;box-sizing:border-box;cursor:pointer;min-width:2.4em;height:2.1em;padding:0 .6em;text-align:center;font:inherit;font-weight:600;color:#1f2937;user-select:none;-webkit-user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent}" +
            ".mes-vspeed button:hover{background:#eef2f7}" +
            ".mes-vspeed button:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}" +
            ".mes-vspeed button:disabled{opacity:.35;cursor:default;background:none}" +
            ".mes-vspeed .mes-vspeed__v{min-width:4.2em;font-variant-numeric:tabular-nums;border-left:1px solid #c9ced6;border-right:1px solid #c9ced6;font-weight:700}" +
            "@media (pointer:coarse){.mes-vspeed button{min-width:2.9em;height:2.6em}}" +
            "body.dark .mes-vspeed,body.dark-mode .mes-vspeed{color:#b8c0cc}" +
            "body.dark .mes-vspeed__g,body.dark-mode .mes-vspeed__g{background:#1f2430;border-color:#3a4252}" +
            "body.dark .mes-vspeed button,body.dark-mode .mes-vspeed button{color:#e6e9ef}" +
            "body.dark .mes-vspeed button:hover,body.dark-mode .mes-vspeed button:hover{background:#2b3241}" +
            "body.dark .mes-vspeed .mes-vspeed__v,body.dark-mode .mes-vspeed .mes-vspeed__v{border-color:#3a4252}";
        document.head.appendChild(s);
    }

    function attach(box) {
        if (box.__mesvsBar) return;
        var bar = document.createElement("div");
        bar.className = "mes-vspeed"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "Video speed");
        bar.innerHTML = '<span class="mes-vspeed__lab">Speed</span><span class="mes-vspeed__g">' +
            '<button type="button" aria-label="Slower">−</button>' +
            '<button type="button" class="mes-vspeed__v" aria-label="Normal speed">1.00×</button>' +
            '<button type="button" aria-label="Faster">+</button></span>';
        var bs = bar.querySelectorAll("button");
        var b = { box: box, bar: bar, slower: bs[0], val: bs[1], faster: bs[2], p: null };
        box.__mesvsBar = b;
        box.parentNode.insertBefore(bar, box.nextSibling);
        holdRepeat(b.slower, function () { step(b, -1); });
        holdRepeat(b.faster, function () { step(b, 1); });
        b.val.addEventListener("click", function () { setRate(1); });
        bars.push(b);
        apply(b);
        // the 3Speak player swaps itself for the YouTube embed when it fails: re-bind
        new MutationObserver(function () { var p = player(box); if (!b.p || !p || p.el !== b.p.el) apply(b); }).observe(box, { childList: true, subtree: true });
    }

    // YouTube answers with infoDelivery: put our speed back when it plays at another one (it starts at 1× after a fresh load)
    window.addEventListener("message", function (e) {
        if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin)) return;
        var d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (x) { return; }
        if (!d || !d.info) return;
        bars.forEach(function (b) {
            if (!b.p || b.p.kind !== "yt" || b.p.el.contentWindow !== e.source) return;
            var want = Math.min(YTMAX, rate);
            if (d.info.playerState === 1 && typeof d.info.playbackRate === "number" && Math.abs(d.info.playbackRate - want) > 0.001) ytRate(b.p.el);
        });
    });

    function scan() {
        css();
        [].forEach.call(document.querySelectorAll(".video-embed"), attach);
    }
    window.MESVideoSpeed = { scan: scan, set: setRate, get: function () { return rate; } };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();
})();
