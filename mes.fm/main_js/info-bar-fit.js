// Dynamically shows as many "utility" links (Links, Subscribe, Store,
// Donate, Contact Us -- in that priority order in the markup) in the
// #info-bar header row as fit without wrapping it to an additional row,
// on both mobile and desktop. The core items (Home, Puzzles, Memes,
// etc.) are always shown as before; the utility items start hidden in
// the HTML and get revealed here one at a time in priority order,
// stopping as soon as one would push the row count up. A no-JS visitor
// just sees the core items with no utility links -- a safe fallback
// rather than a broken/wrapped layout.
(function () {
    function rowCount(items) {
        var tops = [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].offsetParent !== null) {
                var top = items[i].offsetTop;
                if (tops.indexOf(top) === -1) tops.push(top);
            }
        }
        return tops.length;
    }

    function fit() {
        var infoBar = document.getElementById('info-bar');
        if (!infoBar) return;
        var utilities = infoBar.querySelectorAll('.info-bar__item--utility');
        if (!utilities.length) return;

        // The mobile responsive stylesheet forces
        // ".info-bar__item { display: inline-block !important; }", which
        // beats a plain (non-important) inline style -- so hiding an item
        // has to be !important too, or the CSS rule silently wins and the
        // item stays visible regardless of what this script decides.
        for (var i = 0; i < utilities.length; i++) {
            utilities[i].style.setProperty('display', 'none', 'important');
        }

        var baseRows = rowCount(infoBar.querySelectorAll('.info-bar__item'));

        for (var j = 0; j < utilities.length; j++) {
            utilities[j].style.removeProperty('display');
            var rows = rowCount(infoBar.querySelectorAll('.info-bar__item'));
            if (rows > baseRows) {
                utilities[j].style.setProperty('display', 'none', 'important');
                break;
            }
        }
    }

    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fit, 150);
    });

    function fitAndRecheck() {
        fit();
        // Fonts, lazyloaded images, and other async layout shifts can still
        // change the header's height/wrapping shortly after the load event
        // fires, which would make the first fit() pass measure a stale
        // layout. Re-run once things have had a moment to settle so the
        // result matches what a resize recalculation would produce.
        setTimeout(fit, 350);
    }

    if (document.readyState === 'complete') {
        fitAndRecheck();
    } else {
        window.addEventListener('load', fitAndRecheck);
    }
})();
