$(document).ready(function() {

    if(MES_Vars.mobile == false) {
        $("#info-bar .info-bar__item__text:eq("+MES_Vars.current_tab+")").addClass("active-tab");
        $("#navbar>.navbar__item:eq("+MES_Vars.current_tab+")>.navbar__link").addClass("active-tab");
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
        $(this).toggleClass("button--active");
    });

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