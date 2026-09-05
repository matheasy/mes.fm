/* app-nav.js — trimmed offline replacement for mes.fm/main_js/main.js.
   Keeps only what the bundled Percentage Calculator app needs:
   active-tab highlight, the collapsible "?" formula boxes, the hamburger
   side-nav toggle, and the nav dropdown groups. Everything else in main.js
   (Google CSE search, FastComments lazy-loader, desktop/mobile switch) is
   dropped because those features are removed from the app pages. */
$(document).ready(function () {

    var tab = (typeof MES_Vars === "object" && typeof MES_Vars.current_tab === "number")
        ? MES_Vars.current_tab : 0;
    $("#info-bar .info-bar__item__text").eq(tab).addClass("active-tab");
    $("#navbar > .navbar__item").not(".navbar__item--social")
        .eq(tab).children(".navbar__link").addClass("active-tab");
    $(".active-tab .dropdown-symbol").addClass("dropdown-symbol--dark");

    /* collapsible boxes (e.g. the "?" formula panels, "More calculations") */
    $(".hide-div-button").click(function () {
        $(this).next().toggleClass("hide");
        $(this).toggleClass("selected");
    });

    /* hamburger / side-nav button — CSS shows #navbar only while it has .hide */
    $("#navbar-button").click(function () {
        $("#navbar").toggleClass("hide");
        $(this).find(".dropdown-symbol")
            .html($(this).next().hasClass("hide") ? "&#9660;" : "&#9650;");
    });

    /* nav dropdown groups (Calculators / Tools / Mobile Apps) */
    $(".navbar__link--dropdown").click(function () {
        var c = $(this).next(".navbar__dropdown-container");
        c.toggleClass("hide");
        $(this).find(".dropdown-symbol").html(c.hasClass("hide") ? "&#9660;" : "&#9650;");
    });
});
