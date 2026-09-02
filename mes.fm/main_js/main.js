$(document).ready(function() {

    if(MES_Vars.mobile == false) {
        /* current_tab indexes the nav sections as [Home/CalcName, s1, s2, ...].
           #navbar prepends a social-links <li>, so skip it. #info-bar on
           mes.fm's own pages has no "Home" item, so a page can override the
           info-bar index; -1 (or any out-of-range value) highlights nothing. */
        var info_bar_tab = (typeof MES_Vars.info_bar_tab === "number") ? MES_Vars.info_bar_tab : MES_Vars.current_tab;
        if(info_bar_tab >= 0)
            $("#info-bar .info-bar__item__text:eq("+info_bar_tab+")").addClass("active-tab");
        $("#navbar>.navbar__item").not(".navbar__item--social").eq(MES_Vars.current_tab).children(".navbar__link").addClass("active-tab");
        $(".active-tab .dropdown-symbol").addClass("dropdown-symbol--dark");
        $.getScript("https://www.google.com/coop/cse/brand?form=cse-search-box&amp;lang=en");
    }
        
    if(MES_Vars.mobile && MES_Vars.hide_search == false) {
        var search_on = false;
        $(".search-icon-button").click(function() {
            if(search_on == false) {
                var cx = 'partner-pub-1461238060884369:3982767264';
                var gcse = document.createElement('script');
                gcse.type = 'text/javascript';
                gcse.async = true;
                gcse.src = (document.location.protocol == 'https:' ? 'https:' : 'http:') +
                    '//www.google.com/cse/cse.js?cx=' + cx;
                var s = document.getElementsByTagName('script')[0];
                s.parentNode.insertBefore(gcse, s);

                search_on = true;  
            } else {
                $("#google-search-box").toggleClass("hide");  
            }
        });
    }

    $("#comments-button").click(function() {
        $("#comments-box").toggleClass("hide");
        if($("#comments-box").hasClass("hide"))
            $(this).find(".dropdown-symbol").html("&#9660;");
        else
            $(this).find(".dropdown-symbol").html("&#9650;");
    });

    /* Lazy-load the FastComments widget: its embed.min.js used to be a plain
       render-blocking <script> in every page, initialised immediately. Now the
       page just carries an empty #fastcomments-widget (marked FASTCOMMENTS-LAZY)
       and we pull the script only when the comments area nears the viewport
       (it sits below the fold) or on the first click of the Comments toggle. */
    (function() {
        var target = document.getElementById("fastcomments-widget");
        if(!target || window.__fcLazyInit) return;
        window.__fcLazyInit = true;
        var loaded = false;
        function load() {
            if(loaded) return;
            loaded = true;
            var s = document.createElement("script");
            s.src = "https://cdn.fastcomments.com/js/embed.min.js";
            s.onload = function() {
                if(window.FastCommentsUI)
                    window.FastCommentsUI(target, { tenantId: "1RGmGBEjdU" });
            };
            document.head.appendChild(s);
        }
        $("#comments-button").one("click", load);
        if("IntersectionObserver" in window) {
            var io = new IntersectionObserver(function(entries) {
                if(entries[0].isIntersecting) { io.disconnect(); load(); }
            }, { rootMargin: "600px" });
            io.observe(target);
        } else {
            load();
        }
    })();

    $(".hide-div-button").click(function() {
        $(this).next().toggleClass("hide");
        $(this).toggleClass("selected");
    });

    /* side navbar main navigation button */
    $("#navbar-button").click(function() {
        $("#navbar").toggleClass("hide");
        if(MES_Vars.mobile) {
            $("#navbar-preview").toggleClass("hide");
        } else {
           if($(this).next().hasClass("hide"))
                $(this).find(".dropdown-symbol").html("&#9660;");
            else
                $(this).find(".dropdown-symbol").html("&#9650;"); 
        } 
    });

    /* side navbar */
    $(".navbar__link--dropdown").click(function() {
        $(this).next(".navbar__dropdown-container").toggleClass("hide");
        if($(this).next(".navbar__dropdown-container").hasClass("hide"))
            $(this).find(".dropdown-symbol").html("&#9660;");
        else
            $(this).find(".dropdown-symbol").html("&#9650;");
    });

    $(".desktop-version-button").click(function() {
        isMobile(1);
    });

    $(".mobile-version-button").click(function() {
        isMobile(0);
    });

    function isMobile(mobile) {
        var url = window.location.href;

        if(url.indexOf('?mobile=') != -1){
            var lastIndex = url.lastIndexOf('?mobile=');
            url = url.substring(0,lastIndex);
        } else if (url.indexOf('&mobile=') != -1) {
            var lastIndex = url.lastIndexOf('&mobile=');
            url = url.substring(0,lastIndex);
        } else if (mobile) {
            url += ( url.indexOf("?") < 0 ) ? "?mobile=0" : "&mobile=0";
        } else {
            url += ( url.indexOf("?") < 0 ) ? "?mobile=1" : "&mobile=1";
        }

        window.location.href = url;
    }

});