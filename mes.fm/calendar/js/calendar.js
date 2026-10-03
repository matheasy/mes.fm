/* MES Calendar engine: moon phases, seasons, holidays. Pure functions, no DOM. Exposed as window.MESCal (and module.exports for tests). */
(function (root) {
    "use strict";
    var RAD = Math.PI / 180;
    function sin(d) { return Math.sin(d * RAD); }
    function cos(d) { return Math.cos(d * RAD); }

    /* ---- time helpers ---- */
    function deltaT(y) {                      // TT - UT in seconds (Espenak & Meeus, good to a few seconds 1900-2100)
        var t;
        if (y >= 2005 && y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
        if (y >= 1986 && y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * Math.pow(t, 4) + 0.00002373599 * Math.pow(t, 5); }
        if (y >= 1900 && y < 1986) { t = y - 1920; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * Math.pow(t, 4); }
        if (y >= 2050 && y < 2150) return -20 + 32 * Math.pow((y - 1820) / 100, 2) - 0.5628 * (2150 - y);
        t = (y - 1820) / 100; return -20 + 32 * t * t;
    }
    function jdeToMs(jde, y) { return (jde - 2440587.5) * 86400000 - deltaT(y) * 1000; }

    /* ---- moon phases (Meeus, Astronomical Algorithms ch. 49) ---- */
    var A_COEF = [[299.77, 0.107408, 0.000325], [251.88, 0.016321, 0.000165], [251.83, 26.651886, 0.000164], [349.42, 36.412478, 0.000126],
        [84.66, 18.206239, 0.000110], [141.74, 53.303771, 0.000062], [207.14, 2.453732, 0.000060], [154.84, 7.306860, 0.000056],
        [34.52, 27.261239, 0.000047], [207.19, 0.121824, 0.000042], [291.34, 1.844379, 0.000040], [161.72, 24.198154, 0.000037],
        [239.56, 25.513099, 0.000035], [331.55, 3.592518, 0.000023]];
    function phaseJDE(k, ph) {                // ph: 0 new, 1 first quarter, 2 full, 3 last quarter
        k = k + ph / 4;
        var T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
        var jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
        var E = 1 - 0.002516 * T - 0.0000074 * T2;
        var M = 2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3;
        var Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
        var F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
        var Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
        var E2 = E * E, c;
        if (ph === 0) {
            c = -0.40720 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F) + 0.00739 * E * sin(Mp - M) - 0.00514 * E * sin(Mp + M)
              + 0.00208 * E2 * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp)
              + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M)
              + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
              + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
        } else if (ph === 2) {
            c = -0.40614 * sin(Mp) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * Mp) + 0.01043 * sin(2 * F) + 0.00734 * E * sin(Mp - M) - 0.00515 * E * sin(Mp + M)
              + 0.00209 * E2 * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp)
              + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M)
              + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
              + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
        } else {
            c = -0.62801 * sin(Mp) + 0.17172 * E * sin(M) - 0.01183 * E * sin(Mp + M) + 0.00862 * sin(2 * Mp) + 0.00804 * sin(2 * F) + 0.00454 * E * sin(Mp - M)
              + 0.00204 * E2 * sin(2 * M) - 0.00180 * sin(Mp - 2 * F) - 0.00070 * sin(Mp + 2 * F) - 0.00040 * sin(3 * Mp) - 0.00034 * E * sin(2 * Mp - M)
              + 0.00032 * E * sin(M + 2 * F) + 0.00032 * E * sin(M - 2 * F) - 0.00028 * E2 * sin(Mp + 2 * M) + 0.00027 * E * sin(2 * Mp + M) - 0.00017 * sin(Om)
              - 0.00005 * sin(Mp - M - 2 * F) + 0.00004 * sin(2 * Mp + 2 * F) - 0.00004 * sin(Mp + M + 2 * F) + 0.00004 * sin(Mp - 2 * M) + 0.00003 * sin(Mp + M - 2 * F)
              + 0.00003 * sin(3 * M) + 0.00002 * sin(2 * Mp - 2 * F) + 0.00002 * sin(Mp - M + 2 * F) - 0.00002 * sin(3 * Mp + M);
            var W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp) - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
            c += ph === 1 ? W : -W;
        }
        var add = 0;
        for (var i = 0; i < A_COEF.length; i++) {
            var a = A_COEF[i][0] + A_COEF[i][1] * k;
            if (i === 0) a -= 0.009173 * T2;
            add += A_COEF[i][2] * sin(a);
        }
        return jde + c + add;
    }
    /* all phases between two years (inclusive), as [{ms, ph}] sorted by time */
    function moonPhases(y0, y1) {
        var out = [], k0 = Math.floor((y0 - 2000) * 12.3685) - 2, k1 = Math.ceil((y1 + 1 - 2000) * 12.3685) + 2;
        for (var k = k0; k <= k1; k++) for (var ph = 0; ph < 4; ph++) {
            var jde = phaseJDE(k, ph), yr = 2000 + (jde - 2451545) / 365.25;
            out.push({ ms: jdeToMs(jde, yr), ph: ph });
        }
        return out;
    }

    /* ---- equinoxes / solstices (Meeus ch. 27) ---- */
    var SEASON_JDE0 = [[2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057], [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.00030],
        [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078], [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032]];
    var SEASON_TERMS = [[485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186], [182, 27.85, 445267.112], [156, 73.14, 45036.886],
        [136, 171.52, 22518.443], [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513], [58, 119.81, 33718.147], [52, 297.17, 150.678],
        [50, 21.02, 2281.226], [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417], [18, 155.12, 67555.328], [17, 288.79, 4562.452],
        [16, 198.04, 62894.029], [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756], [12, 320.81, 34777.259], [9, 227.73, 1222.114],
        [8, 15.45, 16859.074]];
    function season(year, i) {                // i: 0 March equinox, 1 June solstice, 2 Sept equinox, 3 Dec solstice -> epoch ms
        var Y = (year - 2000) / 1000, c = SEASON_JDE0[i];
        var j0 = c[0] + c[1] * Y + c[2] * Y * Y + c[3] * Y * Y * Y + c[4] * Y * Y * Y * Y;
        var T = (j0 - 2451545) / 36525, W = 35999.373 * T - 2.47, dl = 1 + 0.0334 * cos(W) + 0.0007 * cos(2 * W), S = 0;
        for (var n = 0; n < SEASON_TERMS.length; n++) S += SEASON_TERMS[n][0] * cos(SEASON_TERMS[n][1] + SEASON_TERMS[n][2] * T);
        return jdeToMs(j0 + 0.00001 * S / dl, year);
    }

    /* ---- date helpers (all plain calendar dates: y, m = 0-11, d; "key" = YYYY-MM-DD) ---- */
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function keyOf(dt) { var y = dt.getUTCFullYear(); return (y < 1000 ? ("000" + y).slice(-4) : y) + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate()); }
    function utc(y, m, d) { var dt = new Date(Date.UTC(2000, m, d)); dt.setUTCFullYear(y, m, d); return dt; }
    function dow(y, m, d) { return utc(y, m, d).getUTCDay(); }
    function nthDow(y, m, wd, n) {            // nth (1-based) weekday wd of month m -> day of month
        var first = dow(y, m, 1), d = 1 + ((wd - first + 7) % 7) + (n - 1) * 7; return d;
    }
    function lastDow(y, m, wd) {
        var len = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), last = dow(y, m, len); return len - ((last - wd + 7) % 7);
    }
    function mondayOnOrBefore(y, m, d) { var w = dow(y, m, d); return d - ((w + 6) % 7); }   // Monday on/before (Victoria Day: Monday before May 25)
    function addDays(y, m, d, n) { var dt = utc(y, m, d); dt.setUTCDate(dt.getUTCDate() + n); return dt; }
    function easter(y) {                      // Western (Gregorian) Easter Sunday, Meeus/Jones/Butcher
        var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
            h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
            mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
        return { m: mo - 1, d: da };
    }

    /* ---- event builder ----
       add(map, group, y, m, d, title, kind): groups are the filter chips; kind = "holiday" | "obs" | "astro" | "moon" | "fun" */
    function add(map, g, dt, title, kind, note) {
        var k = keyOf(dt);
        (map[k] || (map[k] = [])).push({ g: g, t: title, k: kind || "holiday", n: note || "" });
    }
    function at(y, m, d) { return utc(y, m, d); }

    /* "observed" rule: Sat -> Fri & Sun -> Mon (US federal), Sat/Sun -> Mon (Canada, AU, UK simple) */
    function observed(map, g, y, m, d, title, rule) {
        var w = dow(y, m, d), shift = 0;
        if (rule === "us") shift = w === 6 ? -1 : (w === 0 ? 1 : 0);
        else shift = w === 6 ? 2 : (w === 0 ? 1 : 0);
        add(map, g, at(y, m, d), title, "holiday");
        if (shift) add(map, g, addDays(y, m, d, shift), title + " (observed)", "holiday");
    }

    function lunarNewYear(y, tzHours) {       // the new moon falling on Jan 21 - Feb 20 (in the given UTC offset) -> Date (UTC midnight of that day)
        var ph = moonPhases(y, y);
        for (var i = 0; i < ph.length; i++) {
            if (ph[i].ph !== 0) continue;
            var t = new Date(ph[i].ms + tzHours * 3600000), m = t.getUTCMonth(), d = t.getUTCDate();
            if (t.getUTCFullYear() === y && ((m === 0 && d >= 21) || (m === 1 && d <= 20))) return utc(y, m, d);
        }
        return null;
    }

    /* Hebrew / Islamic holidays by scanning the year with Intl's calendars (no data tables) */
    function scanCalendar(y, cal, cb) {
        var fmt;
        try { fmt = new Intl.DateTimeFormat("en-u-ca-" + cal + "-nu-latn", { calendar: cal, day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch (e) { return; }
        for (var i = 0; i < 366; i++) {
            var dt = utc(y, 0, 1 + i); if (dt.getUTCFullYear() !== y) break;
            var parts = fmt.formatToParts(dt), o = {};
            for (var p = 0; p < parts.length; p++) o[parts[p].type] = parts[p].value;
            cb(dt, o.month, parseInt(o.day, 10));
        }
    }

    function buildYear(y) {
        var M = {}, i, e, d;
        /* --- moon & astronomy (times are UTC instants; the UI maps them to local days) are handled separately; here only date-based data --- */
        /* --- Canada --- */
        var ca = "ca";
        observed(M, ca, y, 0, 1, "New Year's Day (Canada)", "ca");
        add(M, ca, at(y, 1, nthDow(y, 1, 1, 3)), "Family Day / Louis Riel Day (most provinces)");
        e = easter(y); add(M, ca, at(y, e.m, e.d - 2), "Good Friday (Canada)");
        add(M, ca, at(y, 4, mondayOnOrBefore(y, 4, 24)), "Victoria Day (Canada)");
        add(M, ca, at(y, 5, 24), "Fête nationale du Québec", "holiday");
        observed(M, ca, y, 6, 1, "Canada Day", "ca");
        add(M, ca, at(y, 7, nthDow(y, 7, 1, 1)), "Civic Holiday / BC Day (most provinces)");
        add(M, ca, at(y, 8, nthDow(y, 8, 1, 1)), "Labour Day (Canada)");
        if (y >= 2021) add(M, ca, at(y, 8, 30), "National Day for Truth and Reconciliation");
        add(M, ca, at(y, 9, nthDow(y, 9, 1, 2)), "Thanksgiving (Canada)");
        add(M, ca, at(y, 10, 11), "Remembrance Day (Canada)");
        add(M, ca, at(y, 11, 25), "Christmas Day (Canada)"); add(M, ca, at(y, 11, 26), "Boxing Day (Canada)");
        d = dow(y, 11, 25);                   // weekend Christmas / Boxing Day: the observed days are the next free weekdays
        if (d === 6) { add(M, ca, at(y, 11, 27), "Christmas Day (Canada) (observed)"); add(M, ca, at(y, 11, 28), "Boxing Day (Canada) (observed)"); }
        else if (d === 0) { add(M, ca, at(y, 11, 27), "Christmas Day (Canada) (observed)"); }
        else if (d === 5) { add(M, ca, at(y, 11, 28), "Boxing Day (Canada) (observed)"); }
        /* --- USA --- */
        var us = "us";
        observed(M, us, y, 0, 1, "New Year's Day (USA)", "us");
        add(M, us, at(y, 0, nthDow(y, 0, 1, 3)), "Martin Luther King Jr. Day");
        add(M, us, at(y, 1, nthDow(y, 1, 1, 3)), "Presidents' Day");
        add(M, us, at(y, 4, lastDow(y, 4, 1)), "Memorial Day");
        if (y >= 2021) observed(M, us, y, 5, 19, "Juneteenth", "us");
        observed(M, us, y, 6, 4, "Independence Day (USA)", "us");
        add(M, us, at(y, 8, nthDow(y, 8, 1, 1)), "Labor Day (USA)");
        add(M, us, at(y, 9, nthDow(y, 9, 1, 2)), "Columbus Day / Indigenous Peoples' Day");
        observed(M, us, y, 10, 11, "Veterans Day", "us");
        add(M, us, at(y, 10, nthDow(y, 10, 4, 4)), "Thanksgiving (USA)");
        observed(M, us, y, 11, 25, "Christmas Day (USA)", "us");
        if (y % 2 === 0) add(M, us, at(y, 10, nthDow(y, 10, 1, 1) + 1), "Election Day (USA)", "obs");
        /* --- UK --- */
        var uk = "uk";
        add(M, uk, at(y, 0, 1), "New Year's Day (UK)"); if (dow(y, 0, 1) === 6) add(M, uk, at(y, 0, 3), "New Year's Day (UK) (substitute)"); if (dow(y, 0, 1) === 0) add(M, uk, at(y, 0, 2), "New Year's Day (UK) (substitute)");
        e = easter(y); add(M, uk, at(y, e.m, e.d - 2), "Good Friday (UK)"); add(M, uk, at(y, e.m, e.d + 1), "Easter Monday (UK)");
        add(M, uk, at(y, 4, nthDow(y, 4, 1, 1)), "Early May bank holiday (UK)");
        add(M, uk, at(y, 4, lastDow(y, 4, 1)), "Spring bank holiday (UK)");
        add(M, uk, at(y, 7, lastDow(y, 7, 1)), "Summer bank holiday (England, Wales, NI)");
        add(M, uk, at(y, 11, 25), "Christmas Day (UK)"); add(M, uk, at(y, 11, 26), "Boxing Day (UK)");
        d = dow(y, 11, 25);
        if (d === 6) { add(M, uk, at(y, 11, 27), "Christmas Day (UK) (substitute)"); add(M, uk, at(y, 11, 28), "Boxing Day (UK) (substitute)"); }
        else if (d === 0) { add(M, uk, at(y, 11, 27), "Christmas Day (UK) (substitute)"); }
        else if (d === 5) { add(M, uk, at(y, 11, 28), "Boxing Day (UK) (substitute)"); }
        /* --- Australia --- */
        var au = "au";
        observed(M, au, y, 0, 1, "New Year's Day (Australia)", "ca");
        observed(M, au, y, 0, 26, "Australia Day", "ca");
        e = easter(y); add(M, au, at(y, e.m, e.d - 2), "Good Friday (Australia)"); add(M, au, at(y, e.m, e.d + 1), "Easter Monday (Australia)");
        add(M, au, at(y, 3, 25), "Anzac Day");
        add(M, au, at(y, 5, nthDow(y, 5, 1, 2)), "King's Birthday (most states)");
        add(M, au, at(y, 11, 25), "Christmas Day (Australia)"); add(M, au, at(y, 11, 26), "Boxing Day (Australia)");
        /* --- Vietnam --- */
        var vn = "vn", vt = lunarNewYear(y, 7);
        add(M, vn, at(y, 0, 1), "New Year's Day (Vietnam)");
        if (vt) { add(M, vn, new Date(vt.getTime() - 86400000), "Tết Eve (Vietnam)"); add(M, vn, vt, "Tết Nguyên Đán – Lunar New Year (Vietnam)"); }
        add(M, vn, at(y, 3, 30), "Reunification Day (Vietnam)"); add(M, vn, at(y, 4, 1), "International Labour Day (Vietnam)");
        add(M, vn, at(y, 8, 2), "National Day (Vietnam)");
        /* --- Christian --- */
        var ch = "christian"; e = easter(y);
        add(M, ch, at(y, e.m, e.d - 46), "Ash Wednesday", "obs"); add(M, ch, at(y, e.m, e.d - 7), "Palm Sunday", "obs"); add(M, ch, at(y, e.m, e.d - 2), "Good Friday", "obs");
        add(M, ch, at(y, e.m, e.d), "Easter Sunday", "obs"); add(M, ch, at(y, e.m, e.d + 39), "Ascension Day", "obs"); add(M, ch, at(y, e.m, e.d + 49), "Pentecost", "obs");
        add(M, ch, at(y, 0, 6), "Epiphany", "obs"); add(M, ch, at(y, 10, 1), "All Saints' Day", "obs");
        add(M, ch, at(y, 11, 24), "Christmas Eve", "obs"); add(M, ch, at(y, 11, 25), "Christmas Day", "obs");
        var adv = at(y, 11, 25 - ((dow(y, 11, 25) + 6) % 7 + 1 + 21)); add(M, ch, adv, "First Sunday of Advent", "obs");
        /* --- Lunar New Year (China, Singapore, etc.) --- */
        var cn = lunarNewYear(y, 8);
        if (cn) { add(M, "lunar", new Date(cn.getTime() - 86400000), "Chinese New Year's Eve", "obs"); add(M, "lunar", cn, "Lunar New Year (Chinese New Year)", "obs"); add(M, "lunar", new Date(cn.getTime() + 14 * 86400000), "Lantern Festival", "obs"); }
        /* --- Jewish (Hebrew calendar via Intl; dates are the daytime date, holidays start at the sunset before) --- */
        var leap = false;
        scanCalendar(y, "hebrew", function (dt, mon, day) { if (/Adar II/.test(mon)) leap = true; });
        scanCalendar(y, "hebrew", function (dt, mon, day) {
            if (mon === "Tishri" && day === 1) add(M, "jewish", dt, "Rosh Hashanah (begins at sunset the day before)", "obs");
            else if (mon === "Tishri" && day === 10) add(M, "jewish", dt, "Yom Kippur", "obs");
            else if (mon === "Tishri" && day === 15) add(M, "jewish", dt, "Sukkot (first day)", "obs");
            else if (mon === "Tishri" && day === 23) add(M, "jewish", dt, "Simchat Torah", "obs");
            else if (mon === "Kislev" && day === 25) add(M, "jewish", dt, "Hanukkah (first day)", "obs");
            else if (mon === (leap ? "Adar II" : "Adar") && day === 14) add(M, "jewish", dt, "Purim", "obs");
            else if (mon === "Nisan" && day === 15) add(M, "jewish", dt, "Passover (first day)", "obs");
            else if (mon === "Sivan" && day === 6) add(M, "jewish", dt, "Shavuot", "obs");
        });
        /* --- Islamic (Umm al-Qura calendar; real dates depend on moon sighting and can differ by a day) --- */
        scanCalendar(y, "islamic-umalqura", function (dt, mon, day) {
            var n = mon; // long month names: Muharram, Safar, Rabiʻ I, Rabiʻ II, Jumada I, Jumada II, Rajab, Shaʻban, Ramadan, Shawwal, Dhuʻl-Qiʻdah, Dhuʻl-Hijjah
            if (/^Muharram/.test(n) && day === 1) add(M, "islamic", dt, "Islamic New Year (approx.)", "obs");
            else if (/^Muharram/.test(n) && day === 10) add(M, "islamic", dt, "Ashura (approx.)", "obs");
            else if (/^Rabi.* I$/.test(n) && day === 12) add(M, "islamic", dt, "Mawlid (approx.)", "obs");
            else if (/^Ramadan/.test(n) && day === 1) add(M, "islamic", dt, "Ramadan begins (approx.)", "obs");
            else if (/^Shawwal/.test(n) && day === 1) add(M, "islamic", dt, "Eid al-Fitr (approx.)", "obs");
            else if (/Hijjah/.test(n) && day === 10) add(M, "islamic", dt, "Eid al-Adha (approx.)", "obs");
        });
        /* --- Everyday observances & fun --- */
        var fn = "everyday";
        add(M, fn, at(y, 0, 1), "New Year's Day", "fun"); add(M, fn, at(y, 1, 2), "Groundhog Day", "fun"); add(M, fn, at(y, 1, 14), "Valentine's Day", "fun");
        if (new Date(Date.UTC(y, 2, 0)).getUTCDate() === 29) add(M, fn, at(y, 1, 29), "Leap Day", "fun");
        add(M, fn, at(y, 2, 14), "Pi Day (3.14)", "fun"); add(M, fn, at(y, 2, 17), "St. Patrick's Day", "fun"); add(M, fn, at(y, 3, 1), "April Fools' Day", "fun");
        add(M, fn, at(y, 3, 22), "Earth Day", "fun"); add(M, fn, at(y, 4, 4), "Star Wars Day (May the 4th)", "fun");
        add(M, fn, at(y, 4, nthDow(y, 4, 0, 2)), "Mother's Day (Canada, USA)", "fun"); add(M, fn, at(y, 5, nthDow(y, 5, 0, 3)), "Father's Day (Canada, USA)", "fun");
        add(M, fn, at(y, 6, 22), "Pi Approximation Day (22/7)", "fun");
        add(M, fn, at(y, 9, 31), "Halloween", "fun"); add(M, fn, at(y, 11, 31), "New Year's Eve", "fun");
        for (i = 1; i <= 12; i++) { if (dow(y, i - 1, 13) === 5) add(M, fn, at(y, i - 1, 13), "Friday the 13th", "fun"); }
        /* --- Money dates --- */
        var mn = "money";
        add(M, mn, at(y, 2, 1), "RRSP contribution deadline (Canada, usual)", "obs"); add(M, mn, at(y, 3, 30), "Tax filing deadline (Canada, individuals)", "obs");
        add(M, mn, at(y, 5, 15), "Tax filing deadline (Canada, self-employed)", "obs");
        add(M, mn, at(y, 3, 15), "Tax Day (USA)", "obs"); add(M, mn, at(y, 5, 15), "Q2 estimated tax due (USA)", "obs"); add(M, mn, at(y, 8, 15), "Q3 estimated tax due (USA)", "obs"); add(M, mn, at(y, 0, 15), "Q4 estimated tax due (USA)", "obs");
        add(M, mn, at(y, 0, 31), "Tax-slip deadline: T4 / T5 (Canada)", "obs");
        add(M, mn, at(y, 11, 31), "Year end: last day for tax-year contributions and gifts", "obs");
        /* --- Astronomy: eclipses (selected 2026-2028) --- */
        var EC = { "2026-02-17": "Annular solar eclipse", "2026-03-03": "Total lunar eclipse", "2026-08-12": "Total solar eclipse (Greenland, Iceland, Spain)", "2026-08-28": "Partial lunar eclipse",
                   "2027-02-06": "Annular solar eclipse", "2027-08-02": "Total solar eclipse (Spain, Egypt, Saudi Arabia)", "2028-01-12": "Partial lunar eclipse",
                   "2028-01-26": "Annular solar eclipse", "2028-07-22": "Total solar eclipse (Australia, New Zealand)", "2028-12-31": "Total lunar eclipse" };
        for (var ek in EC) if (ek.slice(0, 4) === String(y)) { (M[ek] || (M[ek] = [])).push({ g: "astro", t: EC[ek], k: "astro", n: "" }); }
        return M;
    }

    /* month-number 0-11 helper for the UI */
    var api = { moonPhases: moonPhases, season: season, buildYear: buildYear, easter: easter, key: keyOf, utc: utc, dow: dow, lunarNewYear: lunarNewYear, nthDow: nthDow };
    if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESCal = api;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Calendar (mes.fm/calendar). lib.js (prepended at build time) supplies window.MESCal: moon phases, seasons and the
   holiday tables. This file is the UI: month / year views, filters, selected-day card, days-between calculator. */
(function () {
    "use strict";
    var C = window.MESCal, root = document.getElementById("cl");
    if (!C || !root) return;
    var $ = function (id) { return document.getElementById(id); };
    var MONTHS = [], MONTHS_SHORT = [], WD = [];
    for (var i = 0; i < 12; i++) { var dt = new Date(2021, i, 1); MONTHS.push(dt.toLocaleDateString(undefined, { month: "long" })); MONTHS_SHORT.push(dt.toLocaleDateString(undefined, { month: "short" })); }
    for (i = 0; i < 7; i++) WD.push(new Date(2021, 7, 1 + i).toLocaleDateString(undefined, { weekday: "short" }));   // Sun..Sat (Aug 1 2021 was a Sunday)
    var MOON_ICON = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
    var FULL_NAMES = ["Wolf", "Snow", "Worm", "Pink", "Flower", "Strawberry", "Buck", "Sturgeon", "Corn", "Hunter's", "Beaver", "Cold"];
    var MIN_Y = 1583, MAX_Y = 2500;

    var GROUPS = [
        { id: "moon", label: "New & full moons", color: "#5c6bc0", on: true, sec: "Sky & time" },
        { id: "moonq", label: "Quarter moons", color: "#5c6bc0", on: false, sec: "Sky & time" },
        { id: "astro", label: "Seasons & eclipses", color: "#3949ab", on: true, sec: "Sky & time" },
        { id: "clocks", label: "Clock changes (DST)", color: "#455a64", on: true, sec: "Sky & time" },
        { id: "ca", label: "Canada", short: "CA", color: "#c62828", on: true, sec: "Public holidays" },
        { id: "us", label: "USA", short: "US", color: "#1565c0", on: true, sec: "Public holidays" },
        { id: "uk", label: "United Kingdom", short: "UK", color: "#7b1fa2", on: false, sec: "Public holidays" },
        { id: "au", label: "Australia", short: "AU", color: "#e65100", on: false, sec: "Public holidays" },
        { id: "vn", label: "Vietnam", short: "VN", color: "#a16207", on: false, sec: "Public holidays" },
        { id: "christian", label: "Christian", color: "#6d4c41", on: false, sec: "Faith & culture" },
        { id: "jewish", label: "Jewish", color: "#00796b", on: false, sec: "Faith & culture" },
        { id: "islamic", label: "Islamic", color: "#2e7d32", on: false, sec: "Faith & culture" },
        { id: "lunar", label: "Lunar New Year", color: "#c2185b", on: false, sec: "Faith & culture" },
        { id: "everyday", label: "Everyday & fun days", color: "#546e7a", on: true, sec: "More" },
        { id: "money", label: "Money & tax dates", color: "#827717", on: false, sec: "More" }
    ];
    var GBY = {}; GROUPS.forEach(function (g) { GBY[g.id] = g; });

    /* ---------- state ---------- */
    var now = new Date();
    var state = { view: "month", y: now.getFullYear(), m: now.getMonth(), sel: null, groups: {}, ws: 0, wk: false, md: false, ys: 2, collapsed: {}, sec: {} };
    GROUPS.forEach(function (g) { state.groups[g.id] = g.on; });
    try { var fd = new Intl.Locale(navigator.language).weekInfo || (new Intl.Locale(navigator.language)).getWeekInfo && new Intl.Locale(navigator.language).getWeekInfo(); if (fd) state.ws = fd.firstDay === 1 ? 1 : 0; } catch (e) {}
    var STORE = "mes-calendar:v1";
    try { var saved = JSON.parse(localStorage.getItem(STORE) || "null"); if (saved) { for (var gk in saved.groups || {}) if (gk in state.groups) state.groups[gk] = !!saved.groups[gk]; ["ws", "wk", "md", "ys"].forEach(function (k) { if (k in saved) state[k] = saved[k]; }); state.collapsed = saved.collapsed || {}; state.sec = saved.sec || {}; } } catch (e) {}
    function save() { try { localStorage.setItem(STORE, JSON.stringify({ groups: state.groups, ws: state.ws, wk: state.wk, md: state.md, ys: state.ys, collapsed: state.collapsed, sec: state.sec })); } catch (e) {} }

    /* ---------- date helpers ---------- */
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function key(y, m, d) { var dt = new Date(2000, 0, 1); dt.setFullYear(y, m, d); return keyOfDate(dt); }
    function keyOfDate(dt) { var y = dt.getFullYear(); return (y < 1000 ? ("000" + y).slice(-4) : y) + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()); }
    function parse(k) { var p = k.split("-"); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
    function localDate(y, m, d) { var dt = new Date(2000, 0, 1, 12); dt.setFullYear(y, m, d); return dt; }          // local noon, safe across DST
    function utcDays(k) { var p = parse(k); return Math.round(Date.UTC(p.y, p.m, p.d) / 864e5); }
    function diffDays(a, b) { return utcDays(b) - utcDays(a); }
    function daysIn(y, m) { var d = new Date(2000, 0, 1); d.setFullYear(y, m + 1, 0); return d.getDate(); }
    function isoWeek(y, m, d) { var t = new Date(Date.UTC(2000, m, d)); t.setUTCFullYear(y, m, d); var dn = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dn + 3); var fy = t.getUTCFullYear(), f = new Date(Date.UTC(2000, 0, 4)); f.setUTCFullYear(fy, 0, 4); return 1 + Math.round(((t - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7); }
    function dayOfYear(y, m, d) { return diffDays(key(y, 0, 1), key(y, m, d)) + 1; }
    function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function timeStr(ms) { return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
    function longDate(k) { var p = parse(k); return localDate(p.y, p.m, p.d).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }); }
    function shortDate(k) { var p = parse(k); return localDate(p.y, p.m, p.d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }); }
    function rel(n) { return n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n > 0 ? "in " + n.toLocaleString() + " days" : Math.abs(n).toLocaleString() + " days ago"; }
    function todayKey() { return keyOfDate(new Date()); }

    /* ---------- astronomy & events (per year, cached) ---------- */
    var phaseCache = {}, yearCache = {};
    function phasesFor(y) { return phaseCache[y] || (phaseCache[y] = C.moonPhases(y - 1, y + 1)); }
    function tzDST(y) {                       // clock-change days of y in the viewer's time zone
        var out = [], prev = null;
        for (var n = 0; n < 367; n++) {
            var d = new Date(2000, 0, 1, 12); d.setFullYear(y, 0, 1 + n); if (d.getFullYear() !== y) break;
            var off = d.getTimezoneOffset();
            if (prev !== null && off !== prev) out.push({ k: keyOfDate(d), fwd: off < prev, by: Math.abs(prev - off) });
            prev = off;
        }
        return out;
    }
    function yearData(y) {
        if (yearCache[y]) return yearCache[y];
        var M = C.buildYear(y), map = {};
        Object.keys(M).forEach(function (k) { map[k] = M[k].slice(); });
        function put(k, ev) { (map[k] || (map[k] = [])).push(ev); }
        var ph = phasesFor(y), fullsByMonth = {};
        ph.forEach(function (p) {
            var d = new Date(p.ms); if (d.getFullYear() !== y) return;
            var k = keyOfDate(d), t = timeStr(p.ms);
            if (p.ph === 0) put(k, { g: "moon", k: "moon", t: "New Moon", time: t, ms: p.ms, icon: MOON_ICON[0] });
            else if (p.ph === 2) {
                var mk = d.getMonth(); fullsByMonth[mk] = (fullsByMonth[mk] || 0) + 1;
                var second = fullsByMonth[mk] === 2, nm = second ? "Blue Moon (2nd full moon this month)" : "Full " + FULL_NAMES[mk] + " Moon";
                put(k, { g: "moon", k: "moon", t: nm, time: t, ms: p.ms, icon: MOON_ICON[4], blue: second });
            } else put(k, { g: "moonq", k: "moon", t: p.ph === 1 ? "First Quarter Moon" : "Last Quarter Moon", time: t, ms: p.ms, icon: p.ph === 1 ? MOON_ICON[2] : MOON_ICON[6] });
        });
        var SEAS = ["March equinox – spring begins (N. Hemisphere)", "June solstice – summer begins (N. Hemisphere)", "September equinox – autumn begins (N. Hemisphere)", "December solstice – winter begins (N. Hemisphere)"];
        for (var s = 0; s < 4; s++) { var ms = C.season(y, s); put(keyOfDate(new Date(ms)), { g: "astro", k: "astro", t: SEAS[s], time: timeStr(ms), ms: ms, season: s }); }
        tzDST(y).forEach(function (c) { put(c.k, { g: "clocks", k: "clock", t: c.fwd ? "Clocks go forward" + (c.by === 60 ? " 1 hour" : "") : "Clocks go back" + (c.by === 60 ? " 1 hour" : ""), time: "" }); });
        return (yearCache[y] = map);
    }
    var REGION = /\s*\((Canada|USA|UK|Australia|Vietnam)\)/, RSHORT = { Canada: "ca", USA: "us", UK: "uk", Australia: "au", Vietnam: "vn" };
    var KORDER = { holiday: 0, obs: 1, astro: 2, clock: 3, fun: 4, moon: 5 };
    function dayEvents(k) {                   // visible events for a day, merged across regions ("Good Friday" CA UK AU)
        var raw = yearData(parse(k).y)[k] || [], merged = {}, out = [];
        raw.forEach(function (e) {
            if (!state.groups[e.g]) return;
            var base = e.t.replace(REGION, ""), id = base + "|" + e.k;
            var m = merged[id];
            if (!m) { m = merged[id] = { t: base, k: e.k, gs: [], time: e.time || "", icon: e.icon || "", ms: e.ms, blue: e.blue, season: e.season }; out.push(m); }
            if (m.gs.indexOf(e.g) < 0) m.gs.push(e.g);
        });
        out.sort(function (a, b) { return (KORDER[a.k] - KORDER[b.k]) || (a.ms || 0) - (b.ms || 0); });
        return out;
    }
    function regionTag(e) { var r = e.gs.filter(function (g) { return GBY[g].short; }).map(function (g) { return GBY[g].short; }); return r.length ? r.join(" ") : ""; }
    function evLabel(e) { var r = regionTag(e); return (e.icon ? e.icon + " " : "") + e.t + (e.time ? " · " + e.time : "") + (r ? " · " + r : ""); }
    function isHolidayEv(e) { return e.k === "holiday"; }

    /* moon phase for any day (local noon), from the exact new moons either side */
    function moonAt(ms) {
        var y = new Date(ms).getFullYear(), ph = phasesFor(y).filter(function (p) { return p.ph === 0; }), prev = null, next = null;
        for (var j = 0; j < ph.length; j++) { if (ph[j].ms <= ms) prev = ph[j].ms; else { next = ph[j].ms; break; } }
        if (prev === null || next === null) return null;
        var f = (ms - prev) / (next - prev), idx = Math.round(f * 8) % 8, lit = (1 - Math.cos(2 * Math.PI * f)) / 2;
        var name = f < 0.03 || f > 0.97 ? "New Moon" : f < 0.22 ? "Waxing crescent" : f < 0.28 ? "First quarter" : f < 0.47 ? "Waxing gibbous" : f < 0.53 ? "Full Moon" : f < 0.72 ? "Waning gibbous" : f < 0.78 ? "Last quarter" : "Waning crescent";
        return { f: f, icon: MOON_ICON[idx], lit: Math.round(lit * 100), name: name };
    }
    function moonOfKey(k) { var p = parse(k); return moonAt(localDate(p.y, p.m, p.d).getTime()); }

    /* ---------- top stats ---------- */
    function nextOf(pred, fromMs) {
        var y = new Date(fromMs).getFullYear(), best = null;
        for (var yy = y; yy <= y + 1 && !best; yy++) phasesFor(yy).forEach(function (p) { if (!best && p.ms > fromMs && pred(p)) best = p; });
        return best;
    }
    function renderStats() {
        var t = new Date(), k = keyOfDate(t), p = parse(k), nowMs = t.getTime(), h = [];
        var doy = dayOfYear(p.y, p.m, p.d), len = isLeap(p.y) ? 366 : 365, mo = moonOfKey(k);
        function tile(label, value, sub, hero) { h.push('<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + '</div><div class="tu-stat__sub">' + sub + "</div></div>"); }
        tile("Today", esc(t.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })), "Day " + doy + " of " + len + " · week " + isoWeek(p.y, p.m, p.d) + " · " + (len - doy) + " days left in " + p.y, true);
        if (mo) tile("Moon today", mo.icon + " " + esc(mo.name), mo.lit + "% lit");
        var nf = nextOf(function (q) { return q.ph === 2; }, nowMs), nn = nextOf(function (q) { return q.ph === 0; }, nowMs);
        function mtile(label, q, icon) { if (!q) return; var kk = keyOfDate(new Date(q.ms)); tile(label, icon + " " + esc(new Date(q.ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })), rel(diffDays(k, kk)) + " · " + timeStr(q.ms)); }
        mtile("Next full moon", nf, MOON_ICON[4]); mtile("Next new moon", nn, MOON_ICON[0]);
        var hol = null, kk2 = utcDays(k);
        for (var n = 0; n < 400 && !hol; n++) { var dd = new Date(Date.UTC(2000, 0, 1)); dd.setTime((kk2 + n) * 864e5); var kx = dd.getUTCFullYear() + "-" + pad(dd.getUTCMonth() + 1) + "-" + pad(dd.getUTCDate()), ev = dayEvents(kx).filter(isHolidayEv).filter(function (e) { return !/observed|substitute/.test(e.t); }); if (ev.length) hol = { k: kx, e: ev[0], n: n }; }
        if (hol) tile("Next holiday", esc(hol.e.t), esc(shortDate(hol.k)) + " · " + rel(hol.n) + (regionTag(hol.e) ? " · " + regionTag(hol.e) : "")); else tile("Next holiday", "—", "Turn on a country below");
        var ns = null, NAMES = ["March equinox", "June solstice", "September equinox", "December solstice"];
        for (var yy = p.y; yy <= p.y + 1 && !ns; yy++) for (var s = 0; s < 4; s++) { var ms = C.season(yy, s); if (!ns && ms > nowMs) ns = { ms: ms, s: s }; }
        if (ns) { var sk = keyOfDate(new Date(ns.ms)); tile("Next season", NAMES[ns.s], esc(new Date(ns.ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })) + " · " + rel(diffDays(k, sk))); }
        $("cl-stats").innerHTML = h.join("");
    }

    /* ---------- filters UI ---------- */
    function renderFilters() {
        var secs = [], by = {};
        GROUPS.forEach(function (g) { if (!by[g.sec]) { by[g.sec] = []; secs.push(g.sec); } by[g.sec].push(g); });
        $("cl-groups").innerHTML = secs.map(function (s) {
            return '<div class="cl-gsec"><span class="tu-label">' + esc(s) + '</span><div class="tu-chips">' + by[s].map(function (g) {
                return '<button type="button" class="tu-chip cl-gchip g-' + g.id + '" data-g="' + g.id + '" aria-pressed="' + !!state.groups[g.id] + '"><i class="cl-gdot"></i>' + esc(g.label) + "</button>";
            }).join("") + "</div></div>";
        }).join("");
        $("cl-o-ws").checked = state.ws === 1; $("cl-o-wk").checked = state.wk; $("cl-o-md").checked = state.md;
        var on = GROUPS.filter(function (g) { return state.groups[g.id]; }).map(function (g) { return g.short || g.label; });
        $("cl-filter-sum").textContent = on.length ? on.join(" · ") : "nothing selected";
        var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
        $("cl-tz").textContent = "Moon, season and eclipse times are shown in your time zone" + (tz ? " (" + tz + ")" : "") + ". Islamic dates are approximate (moon sighting can move them a day); Jewish holidays begin at sunset the evening before the date shown.";
    }

    /* ---------- month view ---------- */
    function dotsFor(evs) { return evs.filter(function (e) { return e.k !== "moon"; }).slice(0, 4).map(function (e) { return '<i class="cl-dot g-' + e.gs[0] + '"></i>'; }).join(""); }
    function monthGrid(y, m) {
        var first = localDate(y, m, 1), off = (first.getDay() - state.ws + 7) % 7, len = daysIn(y, m), rows = Math.ceil((off + len) / 7), tk = todayKey(), h = [];
        h.push('<div class="cl-grid' + (state.wk ? " cl-grid--wk" : "") + '" role="grid">');
        if (state.wk) h.push('<div class="cl-dow cl-wkh">Wk</div>');
        for (var i = 0; i < 7; i++) h.push('<div class="cl-dow">' + esc(WD[(i + state.ws) % 7]) + "</div>");
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < 7; c++) {
                var dt = localDate(y, m, 1 - off + r * 7 + c), k = keyOfDate(dt), evs = dayEvents(k), other = dt.getMonth() !== m, wd = dt.getDay();
                if (c === 0 && state.wk) h.push('<div class="cl-wk">' + isoWeek(dt.getFullYear(), dt.getMonth(), dt.getDate()) + "</div>");
                var moonEv = evs.filter(function (e) { return e.k === "moon"; }), chips = evs.filter(function (e) { return e.k !== "moon"; }), icon = "", mtip = "";
                if (moonEv.length) { icon = moonEv[0].icon; mtip = moonEv.map(evLabel).join("\n"); }
                else if (state.md) { var mo = moonAt(dt.getTime()); if (mo) { icon = mo.icon; mtip = mo.name + " · " + mo.lit + "% lit"; } }
                var tip = evs.map(evLabel).join("\n"); if (!moonEv.length && mtip) tip = (tip ? tip + "\n" : "") + mtip;
                h.push('<button type="button" class="cl-day' + (other ? " is-other" : "") + (k === tk ? " is-today" : "") + (k === state.sel ? " is-sel" : "") + (wd === 0 || wd === 6 ? " is-wknd" : "") + (chips.some(isHolidayEv) ? " is-hol" : "") + '" data-k="' + k + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + ' aria-label="' + esc(longDate(k) + (evs.length ? ": " + evs.map(evLabel).join(", ") : "")) + '"' + (k === state.sel ? ' aria-pressed="true"' : "") + ">");
                h.push('<span class="cl-num">' + dt.getDate() + "</span>" + (icon ? '<span class="cl-moon' + (moonEv.length ? " cl-moon--ev" : "") + '">' + icon + "</span>" : ""));
                h.push('<span class="cl-evs">' + chips.slice(0, 3).map(function (e) { var r = regionTag(e); return '<span class="cl-ev g-' + e.gs[0] + '">' + esc(e.t.split(" \u2013 ")[0]) + (r ? ' <b>' + r + "</b>" : "") + "</span>"; }).join("") + (chips.length > 3 ? '<span class="cl-more">+' + (chips.length - 3) + " more</span>" : "") + "</span>");
                h.push('<span class="cl-dots">' + dotsFor(evs) + "</span></button>");
            }
        }
        return h.join("") + "</div>";
    }

    /* ---------- year view ---------- */
    function miniMonth(y, m) {
        var first = localDate(y, m, 1), off = (first.getDay() - state.ws + 7) % 7, len = daysIn(y, m), rows = Math.ceil((off + len) / 7), tk = todayKey(), folded = !!state.collapsed[m], h = [];
        h.push('<section class="cl-mini' + (folded ? " is-folded" : "") + '" data-m="' + m + '"><header><button type="button" class="cl-mini__name" data-open="' + m + '">' + esc(MONTHS[m]) + '</button><button type="button" class="cl-fold" data-fold="' + m + '" aria-expanded="' + !folded + '" aria-label="' + (folded ? "Expand " : "Collapse ") + esc(MONTHS[m]) + '"><span aria-hidden="true">' + (folded ? "▸" : "▾") + "</span></button></header>");
        if (!folded) {
            h.push('<div class="cl-mgrid' + (state.wk ? " cl-mgrid--wk" : "") + '">');
            if (state.wk) h.push('<span class="cl-mdow"></span>');
            for (var i = 0; i < 7; i++) h.push('<span class="cl-mdow">' + esc(WD[(i + state.ws) % 7].charAt(0)) + "</span>");
            for (var r = 0; r < rows; r++) for (var c = 0; c < 7; c++) {
                var n = 1 - off + r * 7 + c;
                if (c === 0 && state.wk) { var wdt = localDate(y, m, Math.max(1, Math.min(len, n + 3))); h.push('<span class="cl-mwk">' + isoWeek(wdt.getFullYear(), wdt.getMonth(), wdt.getDate()) + "</span>"); }
                if (n < 1 || n > len) { h.push("<span></span>"); continue; }
                var k = key(y, m, n), evs = dayEvents(k), cls = "cl-md", me = evs.filter(function (e) { return e.k === "moon"; });
                if (k === tk) cls += " is-today"; if (evs.some(isHolidayEv)) cls += " is-hol"; else if (evs.some(function (e) { return e.k === "obs" || e.k === "fun" || e.k === "astro" || e.k === "clock"; })) cls += " is-obs";
                if (me.some(function (e) { return e.icon === MOON_ICON[0]; })) cls += " mn-new"; else if (me.some(function (e) { return e.icon === MOON_ICON[4]; })) cls += " mn-full"; else if (me.length) cls += " mn-q";
                var tip = evs.map(evLabel).join("\n");
                h.push('<button type="button" class="' + cls + '" data-k="' + k + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">" + n + "</button>");
            }
            h.push("</div>");
        }
        return h.join("") + "</section>";
    }

    /* ---------- selected day card ---------- */
    function renderDay() {
        var k = state.sel; if (!k) { $("cl-day").innerHTML = ""; return; }
        var p = parse(k), evs = dayEvents(k), mo = moonOfKey(k), n = diffDays(todayKey(), k), h = [];
        var doy = dayOfYear(p.y, p.m, p.d), len = isLeap(p.y) ? 366 : 365, wd = localDate(p.y, p.m, p.d).getDay();
        $("cl-day-sum").textContent = shortDate(k);
        h.push('<div class="cl-dayhead"><div><div class="cl-daytitle">' + esc(longDate(k)) + '</div><div class="tu-note">' + esc(rel(n).charAt(0).toUpperCase() + rel(n).slice(1)) + " · day " + doy + " of " + len + " · ISO week " + isoWeek(p.y, p.m, p.d) + " · " + (len - doy) + " days left in the year</div></div>");
        if (mo) h.push('<div class="cl-daymoon"><span class="cl-bigmoon">' + mo.icon + '</span><span><b>' + esc(mo.name) + '</b><br><span class="tu-note">about ' + mo.lit + "% lit</span></span></div>");
        h.push("</div>");
        var holidays = evs.filter(isHolidayEv);
        if (holidays.length && (wd === 1 || wd === 5)) h.push('<p class="cl-long">Long weekend: ' + (wd === 1 ? "Saturday to Monday" : "Friday to Sunday") + " (3 days).</p>");
        else if (holidays.length && (wd === 6 || wd === 0)) h.push('<p class="cl-long">This holiday falls on a weekend; the observed day is usually the nearest weekday.</p>');
        if (evs.length) h.push('<ul class="cl-evlist">' + evs.map(function (e) { return '<li><i class="cl-dot g-' + e.gs[0] + '"></i><span><b>' + (e.icon ? e.icon + " " : "") + esc(e.t) + "</b>" + (e.time ? " · " + esc(e.time) : "") + (regionTag(e) ? ' <span class="cl-tag">' + esc(regionTag(e)) + "</span>" : "") + "</span></li>"; }).join("") + "</ul>");
        else h.push('<p class="tu-note">Nothing on this day with the current filters.</p>');
        h.push('<div class="tu-chips"><button type="button" class="tu-chip" id="cl-d-from">Use as “from” date</button><button type="button" class="tu-chip" id="cl-d-to">Use as “to” date</button><button type="button" class="tu-chip" id="cl-d-link">Copy link to this day</button></div>');
        $("cl-day").innerHTML = h.join("");
    }

    /* ---------- events list for the visible month / year ---------- */
    function renderList() {
        var h = [], count = 0, y = state.y, months = state.view === "year" ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [state.m];
        $("cl-list-t").textContent = state.view === "year" ? "Events in " + y : "Events in " + MONTHS[state.m] + " " + y;
        months.forEach(function (m) {
            var len = daysIn(y, m), rows = [];
            for (var d = 1; d <= len; d++) { var k = key(y, m, d), evs = dayEvents(k); evs.forEach(function (e) { rows.push([k, d, e]); }); }
            if (!rows.length) return;
            if (state.view === "year") h.push('<h3 class="cl-lm">' + esc(MONTHS[m]) + "</h3>");
            h.push('<ul class="cl-evlist cl-evlist--rows">' + rows.map(function (r) {
                count++; var e = r[2], wd = localDate(y, m, r[1]).toLocaleDateString(undefined, { weekday: "short" });
                return '<li><button type="button" class="cl-rowbtn" data-k="' + r[0] + '"><span class="cl-rowdate">' + esc(wd) + " " + esc(MONTHS_SHORT[m]) + " " + r[1] + '</span><i class="cl-dot g-' + e.gs[0] + '"></i><span class="cl-rowtxt">' + (e.icon ? e.icon + " " : "") + esc(e.t) + (e.time ? " · " + esc(e.time) : "") + (regionTag(e) ? ' <span class="cl-tag">' + esc(regionTag(e)) + "</span>" : "") + "</span></button></li>";
            }).join("") + "</ul>");
        });
        $("cl-list").innerHTML = count ? h.join("") : '<p class="tu-note">No events with the current filters. Turn some on under “Show on the calendar”.</p>';
    }

    /* ---------- main render ---------- */
    function render() {
        var y = state.y, m = state.m, main = $("cl-main");
        $("cl-v-month").setAttribute("aria-pressed", state.view === "month"); $("cl-v-year").setAttribute("aria-pressed", state.view === "year");
        $("cl-title").textContent = state.view === "year" ? String(y) : MONTHS[m] + " " + y;
        $("cl-prev").setAttribute("aria-label", state.view === "year" ? "Previous year" : "Previous month"); $("cl-next").setAttribute("aria-label", state.view === "year" ? "Next year" : "Next month"); $("cl-side-prev").setAttribute("aria-label", state.view === "year" ? "Previous year" : "Previous month"); $("cl-side-next").setAttribute("aria-label", state.view === "year" ? "Next year" : "Next month");
        $("cl-jm").value = m; $("cl-jy").value = y; if (state.sel) $("cl-jd").value = state.sel;
        if (state.view === "year") { var h = []; for (var i = 0; i < 12; i++) h.push(miniMonth(y, i)); main.innerHTML = '<div class="cl-year" data-size="' + state.ys + '">' + h.join("") + '</div><p class="tu-note cl-legend"><i class="cl-lg cl-lg--new"></i> new moon &nbsp; <i class="cl-lg cl-lg--full"></i> full moon &nbsp; <i class="cl-lg cl-lg--q"></i> quarter moon &nbsp; <b class="cl-lg-red">red</b> public holiday &nbsp; <span class="cl-lg-dot">dotted</span> observance or event. Hover a day for details, click it to open the month.</p>'; }
        else main.innerHTML = monthGrid(y, m);
        $("cl-size").hidden = state.view !== "year";
        [].forEach.call($("cl-size").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", +b.dataset.ys === state.ys); });
        var fa = $("cl-foldall"); fa.textContent = allFolded() ? "Expand all" : "Collapse all";
        renderFilters(); renderStats(); renderDay(); renderList(); syncUrl();
        document.title = (state.view === "year" ? y : MONTHS[m] + " " + y) + " Calendar – Moon Phases & Holidays | Math Easy Solutions";
    }
    function allFolded() {
        if (state.view === "year") { for (var i = 0; i < 12; i++) if (!state.collapsed[i]) return false; return true; }
        return !["cl-daysec", "cl-listsec", "cl-between", "cl-filters"].some(function (id) { return $(id).open; });
    }
    function syncUrl() {
        var p = new URLSearchParams(); p.set("y", state.y); p.set("m", state.m + 1); if (state.sel && parse(state.sel).y === state.y && parse(state.sel).m === state.m) p.set("d", parse(state.sel).d); if (state.view === "year") p.set("v", "year");
        var nw = new Date(), isNow = state.y === nw.getFullYear() && state.m === nw.getMonth() && state.view === "month" && (!state.sel || state.sel === keyOfDate(nw));
        try { history.replaceState(null, "", location.pathname + (isNow ? "" : "?" + p.toString())); } catch (e) {}
    }

    /* ---------- navigation ---------- */
    function clampY(y) { return Math.max(MIN_Y, Math.min(MAX_Y, y)); }
    function go(y, m) { y = clampY(y); while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } state.y = clampY(y); state.m = m; render(); }
    function selectKey(k, open) { var p = parse(k); state.sel = k; state.y = clampY(p.y); state.m = p.m; if (open) state.view = "month"; save(); render(); }
    function step(dir) { if (state.view === "year") go(state.y + dir, state.m); else go(state.y, state.m + dir); }

    /* ---------- days between / add ---------- */
    function setVal(id, v) { $(id).value = v; }
    function ymdDiff(a, b) {                   // whole years / months / days from a to b (a <= b)
        var pa = parse(a), pb = parse(b), y = pb.y - pa.y, m = pb.m - pa.m, d = pb.d - pa.d;
        if (d < 0) { m--; var pm = pb.m - 1, py = pb.y; if (pm < 0) { pm = 11; py--; } d += daysIn(py, pm); }
        if (m < 0) { y--; m += 12; }
        return [y, m, d];
    }
    function businessDays(a, b) {             // Mon-Fri days in [a, b)
        var n = diffDays(a, b), full = Math.floor(n / 7), c = full * 5, w = (new Date(utcDays(a) * 864e5).getUTCDay());
        for (var r = 0; r < n % 7; r++) { var wd = (w + r) % 7; if (wd !== 0 && wd !== 6) c++; }
        return c;
    }
    function renderBetween() {
        var a = $("cl-b1").value, b = $("cl-b2").value, out = $("cl-b-out");
        if (!a || !b) { out.innerHTML = '<p class="tu-note">Pick two dates.</p>'; return; }
        var neg = diffDays(a, b) < 0, lo = neg ? b : a, hi = neg ? a : b, n = Math.abs(diffDays(a, b)), inc = $("cl-b-inc").checked ? 1 : 0, total = n + inc;
        var ymd = ymdDiff(lo, hi), bd = businessDays(lo, hi) + (inc && (function () { var w = new Date(utcDays(hi) * 864e5).getUTCDay(); return w !== 0 && w !== 6; })() ? 1 : 0);
        function tile(l, v, s, hero) { return '<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
        out.innerHTML = tile("Days", total.toLocaleString(), (neg ? "the first date is after the second" : esc(shortDate(a)) + " → " + esc(shortDate(b))), true)
            + tile("Weeks & days", Math.floor(total / 7).toLocaleString() + " w " + (total % 7) + " d", (total / 7).toFixed(2) + " weeks")
            + tile("Years, months, days", ymd[0] + " y " + ymd[1] + " m " + ymd[2] + " d", "calendar difference")
            + tile("Business days", bd.toLocaleString(), "Monday to Friday, no holidays removed")
            + tile("Hours", (total * 24).toLocaleString(), (total * 1440).toLocaleString() + " minutes");
    }
    function renderAdd() {
        var a = $("cl-a1").value, n = parseInt($("cl-an").value, 10), u = $("cl-au").value, out = $("cl-a-out");
        if (!a || isNaN(n)) { out.innerHTML = '<p class="tu-note">Enter a start date and an amount (use a negative number to go back).</p>'; return; }
        var p = parse(a), dt = new Date(Date.UTC(2000, 0, 1)); dt.setUTCFullYear(p.y, p.m, p.d);
        if (u === "d") dt.setUTCDate(dt.getUTCDate() + n);
        else if (u === "w") dt.setUTCDate(dt.getUTCDate() + 7 * n);
        else if (u === "b") { var dir = n < 0 ? -1 : 1, left = Math.abs(n); while (left > 0) { dt.setUTCDate(dt.getUTCDate() + dir); var w = dt.getUTCDay(); if (w !== 0 && w !== 6) left--; } }
        else { var mm = u === "y" ? 12 * n : n, day = p.d; dt.setUTCDate(1); dt.setUTCMonth(dt.getUTCMonth() + mm); var last = new Date(Date.UTC(2000, 0, 1)); last.setUTCFullYear(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0); dt.setUTCDate(Math.min(day, last.getUTCDate())); }
        var k = dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());
        out.innerHTML = '<div class="tu-stat tu-stat--hero"><div class="tu-stat__label">Result</div><div class="tu-stat__value">' + esc(longDate(k)) + '</div><div class="tu-stat__sub">' + esc(rel(diffDays(todayKey(), k))) + ' · <button type="button" class="tu-chip" id="cl-a-go" data-k="' + k + '">Show on calendar</button></div></div>';
    }

    /* ---------- events ---------- */
    function foldAll() {
        var fold = !allFolded();
        if (state.view === "year") { for (var i = 0; i < 12; i++) state.collapsed[i] = fold; }
        ["cl-daysec", "cl-listsec", "cl-between", "cl-filters"].forEach(function (id) { $(id).open = !fold; state.sec[id] = !fold; });
        save(); render();
    }
    root.addEventListener("click", function (e) {
        var t = e.target, el;
        if ((el = t.closest(".cl-gchip"))) { state.groups[el.dataset.g] = !state.groups[el.dataset.g]; yearCacheFlush(); save(); render(); return; }
        if ((el = t.closest("[data-fold]"))) { var m = +el.dataset.fold; state.collapsed[m] = !state.collapsed[m]; save(); render(); return; }
        if ((el = t.closest("[data-open]"))) { state.m = +el.dataset.open; state.view = "month"; save(); render(); return; }
        if ((el = t.closest(".cl-day, .cl-md, .cl-rowbtn"))) { var k = el.dataset.k; if (el.classList.contains("cl-md") || el.classList.contains("cl-rowbtn") || parse(k).m !== state.m || parse(k).y !== state.y) { selectKey(k, true); } else { state.sel = k; render(); } if (el.classList.contains("cl-rowbtn")) $("cl-day").scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
        if (t.id === "cl-d-from") { setVal("cl-b1", state.sel); $("cl-between").open = true; renderBetween(); $("cl-between").scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
        if (t.id === "cl-d-to") { setVal("cl-b2", state.sel); $("cl-between").open = true; renderBetween(); $("cl-between").scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
        if (t.id === "cl-d-link") { var url = location.origin + location.pathname + "?y=" + parse(state.sel).y + "&m=" + (parse(state.sel).m + 1) + "&d=" + parse(state.sel).d; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Link copied"); }, function () { toast(url); }); return; }
        if (t.id === "cl-a-go") { selectKey(t.dataset.k, true); return; }
    });
    function yearCacheFlush() { yearCache = {}; }
    function toast(msg) { var el = document.createElement("div"); el.className = "tu-toast"; el.textContent = msg; document.body.appendChild(el); requestAnimationFrame(function () { el.classList.add("tu-toast--show"); }); setTimeout(function () { el.remove(); }, 1800); }
    $("cl-prev").addEventListener("click", function () { step(-1); });
    $("cl-next").addEventListener("click", function () { step(1); });
    $("cl-side-prev").addEventListener("click", function () { step(-1); });
    $("cl-side-next").addEventListener("click", function () { step(1); });
    document.addEventListener("keydown", function (e) {      // left / right arrow = previous / next month (year in year view), unless typing or using a modifier
        var t = e.target, tag = t && t.tagName;
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (tag && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(tag)) || (t && t.isContentEditable)) return;
        if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); } else if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
    });
    (function () {                                           // swipe left / right on the calendar (touch screens)
        var st = $("cl-stage"), x0 = 0, y0 = 0, t0 = 0;
        st.addEventListener("touchstart", function (e) { if (e.touches.length !== 1) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
        st.addEventListener("touchend", function (e) {
            if (!t0 || !e.changedTouches.length) return; var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0, dt = Date.now() - t0; t0 = 0;
            if (dt < 600 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) step(dx < 0 ? 1 : -1);
        }, { passive: true });
    })();
    $("cl-today").addEventListener("click", function () { var n = new Date(); state.sel = keyOfDate(n); state.y = n.getFullYear(); state.m = n.getMonth(); render(); });
    $("cl-v-month").addEventListener("click", function () { state.view = "month"; save(); render(); });
    $("cl-v-year").addEventListener("click", function () { state.view = "year"; save(); render(); });
    $("cl-foldall").addEventListener("click", foldAll);
    $("cl-size").addEventListener("click", function (e) { var b = e.target.closest("button[data-ys]"); if (!b) return; state.ys = +b.dataset.ys; save(); render(); });
    $("cl-jm").addEventListener("change", function () { go(state.y, +this.value); });
    $("cl-jy").addEventListener("change", function () { var v = parseInt(this.value, 10); if (!isNaN(v)) go(v, state.m); else render(); });
    $("cl-jd").addEventListener("change", function () { if (this.value) selectKey(this.value, true); });
    $("cl-o-ws").addEventListener("change", function () { state.ws = this.checked ? 1 : 0; save(); render(); });
    $("cl-o-wk").addEventListener("change", function () { state.wk = this.checked; save(); render(); });
    $("cl-o-md").addEventListener("change", function () { state.md = this.checked; save(); render(); });
    ["cl-b1", "cl-b2", "cl-b-inc"].forEach(function (id) { $(id).addEventListener("input", renderBetween); });
    ["cl-a1", "cl-an", "cl-au"].forEach(function (id) { $(id).addEventListener("input", renderAdd); });
    $("cl-b-sel1").addEventListener("click", function () { setVal("cl-b1", state.sel); renderBetween(); });
    $("cl-b-sel2").addEventListener("click", function () { setVal("cl-b2", state.sel); renderBetween(); });
    $("cl-b-swap").addEventListener("click", function () { var a = $("cl-b1").value; setVal("cl-b1", $("cl-b2").value); setVal("cl-b2", a); renderBetween(); });
    ["cl-filters", "cl-daysec", "cl-listsec", "cl-between"].forEach(function (id) { $(id).addEventListener("toggle", function () { state.sec[id] = this.open; save(); $("cl-foldall").textContent = allFolded() ? "Expand all" : "Collapse all"; }); });
    document.addEventListener("keydown", function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName || ""))) return;
        if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); } else if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
        else if (e.key === "t" || e.key === "T") $("cl-today").click(); else if (e.key === "m" || e.key === "M") $("cl-v-month").click(); else if (e.key === "y" || e.key === "Y") $("cl-v-year").click();
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) renderStats(); });

    /* ---------- init ---------- */
    (function init() {
        $("cl-jm").innerHTML = MONTHS.map(function (n, i) { return '<option value="' + i + '">' + esc(n) + "</option>"; }).join("");
        var q = new URLSearchParams(location.search), qy = parseInt(q.get("y"), 10), qm = parseInt(q.get("m"), 10), qd = parseInt(q.get("d"), 10);
        if (!isNaN(qy)) { state.y = clampY(qy); state.m = !isNaN(qm) && qm >= 1 && qm <= 12 ? qm - 1 : (qy === now.getFullYear() ? now.getMonth() : 0); if (!isNaN(qd) && qd >= 1 && qd <= daysIn(state.y, state.m)) state.sel = key(state.y, state.m, qd); }
        if (q.get("v") === "year" || q.get("v") === "month") state.view = q.get("v");
        if (!state.sel) state.sel = (state.y === now.getFullYear() && state.m === now.getMonth()) ? keyOfDate(now) : key(state.y, state.m, 1);
        ["cl-filters", "cl-daysec", "cl-listsec", "cl-between"].forEach(function (id) { if (id in state.sec) $(id).open = !!state.sec[id]; });
        var tk = todayKey(), nxt = new Date(); nxt.setFullYear(nxt.getFullYear() + 1, 0, 1);
        setVal("cl-b1", tk); setVal("cl-b2", keyOfDate(nxt)); setVal("cl-a1", tk);
        render(); renderBetween(); renderAdd();
    })();
})();
