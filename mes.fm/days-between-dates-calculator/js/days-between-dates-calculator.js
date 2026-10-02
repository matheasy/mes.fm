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

/* MES Days Between Dates -- pure date maths (no DOM), prepended to app.js by build_tool_apps.py (after the calendar's holiday engine,
 * see `lib_from` in build_tool_apps.py). Also runs in node: require() it to test.
 * Everything works on "naive" wall-clock milliseconds (Date.UTC of the typed date + time), so there is no daylight-saving or
 * time-zone drift in the calendar breakdown; actual elapsed time across a DST change is reported separately. */
var DC = (function () {
	'use strict';
	var DAY = 86400000, HOUR = 3600000, MIN = 60000;
	function utcMs(y, m, d, h, mi, s) { var dt = new Date(0); dt.setUTCFullYear(y, m, d); dt.setUTCHours(h || 0, mi || 0, s || 0, 0); return dt.getTime(); }
	function parts(ms) { var dt = new Date(ms); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes(), s: dt.getUTCSeconds(), dow: dt.getUTCDay() }; }
	function dim(y, m) { var dt = new Date(0); dt.setUTCFullYear(y, m + 1, 0); return dt.getUTCDate(); }
	function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
	function addMonths(ms, n) {                 // keeps the time of day; Jan 31 + 1 month = Feb 28/29
		var p = parts(ms), tot = p.y * 12 + p.m + n, y = Math.floor(tot / 12), m = tot - y * 12;
		return utcMs(y, m, Math.min(p.d, dim(y, m)), p.h, p.mi, p.s);
	}
	function wholeMonths(a, b) {                // most whole months that fit between a and b (a <= b)
		var pa = parts(a), pb = parts(b), M = (pb.y - pa.y) * 12 + (pb.m - pa.m);
		while (M > 0 && addMonths(a, M) > b) M--;
		while (addMonths(a, M + 1) <= b) M++;
		return M;
	}
	function parseISO(s) {                      // "2026-10-01" -> {y,m,d} or null
		var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim()); if (!m) return null;
		var y = +m[1], mo = +m[2] - 1, d = +m[3]; if (mo < 0 || mo > 11 || d < 1 || d > dim(y, mo)) return null;
		return { y: y, m: mo, d: d };
	}
	function parseTime(s) { var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(s || '').trim()); if (!m) return { h: 0, mi: 0, s: 0 }; return { h: Math.min(23, +m[1]), mi: Math.min(59, +m[2]), s: Math.min(59, +(m[3] || 0)) }; }
	function iso(ms) { var p = parts(ms), y = p.y; return (y < 1000 ? ('000' + y).slice(-4) : y) + '-' + ('0' + (p.m + 1)).slice(-2) + '-' + ('0' + p.d).slice(-2); }
	function dayOfYear(ms) { var p = parts(ms); return Math.round((Date.UTC(p.y, p.m, p.d) - utcMs(p.y, 0, 1)) / DAY) + 1; }
	function isoWeek(ms) {
		var p = parts(ms), day = utcMs(p.y, p.m, p.d), dn = (p.dow + 6) % 7, thu = day - dn * DAY + 3 * DAY, ty = parts(thu).y;
		return { year: ty, week: Math.ceil(((thu - utcMs(ty, 0, 1)) / DAY + 1) / 7) };
	}

	var ORDER = ['y', 'm', 'w', 'd', 'h', 'n', 's'], SIZES = { w: 7 * DAY, d: DAY, h: HOUR, n: MIN, s: 1000 };
	var LABEL = { y: ['year', 'years'], m: ['month', 'months'], w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'], n: ['minute', 'minutes'], s: ['second', 'seconds'] };
	function num(v) { var r = Math.round(v * 100) / 100; return r.toLocaleString('en-US', { maximumFractionDigits: 2 }); }

	// Express the span a..b (a <= b, naive ms) in exactly the chosen units, largest first; the smallest chosen unit absorbs the remainder as a decimal.
	function breakdown(a, b, sel) {
		var chosen = ORDER.filter(function (u) { return sel[u]; }); if (!chosen.length) { chosen = ['d']; sel = { d: true }; }
		var vals = {}, base = a;
		if (sel.y || sel.m) {
			var M = wholeMonths(a, b);
			if (sel.y && sel.m) { vals.y = Math.floor(M / 12); vals.m = M % 12; base = addMonths(a, M); }
			else if (sel.y) { vals.y = Math.floor(M / 12); base = addMonths(a, vals.y * 12); }
			else { vals.m = M; base = addMonths(a, M); }
		}
		var rem = b - base;
		['w', 'd', 'h', 'n', 's'].forEach(function (u) { if (sel[u]) { var q = Math.floor(rem / SIZES[u]); vals[u] = q; rem -= q * SIZES[u]; } });
		var last = chosen[chosen.length - 1];
		if (rem > 0) {
			var size = last === 'm' ? addMonths(base, 1) - base : last === 'y' ? addMonths(base, 12) - base : SIZES[last];
			vals[last] += rem / size;
		}
		var out = [];
		chosen.forEach(function (u) { var v = vals[u]; if (v > 0 || (u === last && !out.length)) out.push({ u: u, v: v, text: num(v) + ' ' + LABEL[u][Math.round(v * 100) / 100 === 1 ? 0 : 1] }); });
		return { parts: out, text: out.map(function (p) { return p.text; }).join(', ') };
	}

	function weekdayCounts(startDay, n) {       // how many of each weekday (0=Sun) in n days starting at day number startDay
		var c = [0, 0, 0, 0, 0, 0, 0], dow0 = parts(startDay * DAY).dow, q = Math.floor(n / 7), r = n % 7, i;
		for (i = 0; i < 7; i++) c[i] = q; for (i = 0; i < r; i++) c[(dow0 + i) % 7]++;
		return c;
	}
	// days startDay .. startDay+n-1 split into working / weekend / holiday. weekend = array of weekday numbers (0=Sun). holidays = {dayNumber: true}
	function workCount(startDay, n, weekend, holidays) {
		var wc = weekdayCounts(startDay, n), weekendDays = 0, i;
		weekend.forEach(function (d) { weekendDays += wc[d]; });
		var hol = [];
		for (var k in holidays) { var dn = +k; if (dn >= startDay && dn < startDay + n && weekend.indexOf(parts(dn * DAY).dow) < 0) hol.push(dn); }
		hol.sort(function (x, y) { return x - y; });
		return { work: n - weekendDays - hol.length, weekend: weekendDays, holidays: hol };
	}

	// zone helpers, used only for the "actual elapsed time" tile
	function offsetAt(utc, zone) {
		var f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }), o = {};
		f.formatToParts(new Date(utc)).forEach(function (p) { o[p.type] = +p.value; });
		return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(utc / 1000) * 1000;
	}
	function wallToUtc(naive, zone) {
		if (!zone || zone === 'local') { var p = parts(naive); return new Date(p.y, p.m, p.d, p.h, p.mi, p.s).getTime(); }
		var u = naive - offsetAt(naive, zone); u = naive - offsetAt(u, zone); return u;
	}

	return { DAY: DAY, utcMs: utcMs, parts: parts, dim: dim, isLeap: isLeap, addMonths: addMonths, wholeMonths: wholeMonths, parseISO: parseISO, parseTime: parseTime, iso: iso,
		dayOfYear: dayOfYear, isoWeek: isoWeek, breakdown: breakdown, weekdayCounts: weekdayCounts, workCount: workCount, wallToUtc: wallToUtc, num: num, LABEL: LABEL };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DC;

/* MES Days Between Dates UI (date maths = DC in lib.js, holidays = MESCal from the calendar engine; both prepended above) */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-days:v1';
	var UNITS = [['y', 'Years'], ['m', 'Months'], ['w', 'Weeks'], ['d', 'Days'], ['h', 'Hours'], ['n', 'Minutes'], ['s', 'Seconds']];
	var PRESETS = [['Y · M · D', 'ymd'], ['M · D', 'md'], ['W · D', 'wd'], ['Days', 'd'], ['Weeks', 'w'], ['Months', 'm'], ['D · H · M · S', 'dhns'], ['Hours', 'h'], ['H · M · S', 'hns'], ['Minutes', 'n'], ['Seconds', 's']];
	var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	var state = { units: 'ymd', incl: false, time: false, weekend: [0, 6], region: '', hol: '', zone: 'local' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in state) state[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
	var toastTimer;
	function toast(msg) { var t = $('db-toast'); t.textContent = msg; t.classList.add('tu-toast--show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 1500); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fb); else fb();
		function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta); }
	}
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
	function stat(label, value, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	var N = DC.num, DAY = DC.DAY;
	function fmtDate(ms, withTime) {
		var p = DC.parts(ms), s = WDL[p.dow] + ', ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.m] + ' ' + p.d + ', ' + p.y;
		if (withTime) s += ' at ' + ('0' + p.h).slice(-2) + ':' + ('0' + p.mi).slice(-2) + ':' + ('0' + p.s).slice(-2);
		return s;
	}
	function todayMs() { var n = new Date(); return DC.utcMs(n.getFullYear(), n.getMonth(), n.getDate()); }

	/* ---------- static UI ---------- */
	$('db-units').innerHTML = UNITS.map(function (u) { return '<label class="db-check"><input type="checkbox" data-u="' + u[0] + '"> ' + u[1] + '</label>'; }).join('');
	$('db-presets').innerHTML = PRESETS.map(function (p) { return '<button type="button" class="tu-chip" data-p="' + p[1] + '" aria-pressed="false">' + p[0] + '</button>'; }).join('');
	$('db-wk').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<label class="db-check"><input type="checkbox" data-wd="' + d + '"> ' + WD[d] + '</label>'; }).join('');
	var zones = ['local', 'UTC']; try { if (Intl.supportedValuesOf) zones = zones.concat(Intl.supportedValuesOf('timeZone').filter(function (z) { return z !== 'UTC'; })); } catch (e) {}
	$('db-zone').innerHTML = zones.map(function (z) { return '<option value="' + z + '">' + (z === 'local' ? 'Your time zone (' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'local') + ')' : z.replace(/_/g, ' ')) + '</option>'; }).join('');
	function quickRanges() {
		var t = DC.parts(todayMs()), y = t.y, now = todayMs();
		var xmas = DC.utcMs(t.m === 11 && t.d > 25 ? y + 1 : y, 11, 25), ny = DC.utcMs(y + 1, 0, 1);
		return [['Days until Christmas', now, xmas], ['Days until New Year', now, ny], ['Days since Jan 1', DC.utcMs(y, 0, 1), now], ['Next 30 days', now, now + 30 * DAY], ['Next 90 days', now, now + 90 * DAY], ['This year', DC.utcMs(y, 0, 1), DC.utcMs(y + 1, 0, 1)], ['This month', DC.utcMs(y, t.m, 1), DC.addMonths(DC.utcMs(y, t.m, 1), 1)]];
	}
	var QR = quickRanges();
	$('db-quick').innerHTML = QR.map(function (q, i) { return '<button type="button" class="tu-chip" data-q="' + i + '">' + q[0] + '</button>'; }).join('');

	/* ---------- inputs ---------- */
	function readMs(dateId, timeId) {
		var d = DC.parseISO($(dateId).value); if (!d) return null;
		var t = state.time ? DC.parseTime($(timeId).value) : { h: 0, mi: 0, s: 0 };
		return DC.utcMs(d.y, d.m, d.d, t.h, t.mi, t.s);
	}
	function selUnits() { var sel = {}; Array.prototype.forEach.call($('db-units').querySelectorAll('input'), function (i) { if (i.checked) sel[i.dataset.u] = true; }); return sel; }
	function setUnits(code) { Array.prototype.forEach.call($('db-units').querySelectorAll('input'), function (i) { i.checked = code.indexOf(i.dataset.u) >= 0; }); }
	function holidaySet(a, b) {
		var set = {}, list = [];
		if (state.region && typeof MESCal !== 'undefined') {
			var y0 = DC.parts(a).y, y1 = DC.parts(b).y;
			for (var y = y0; y <= Math.min(y1, y0 + 150); y++) {
				var m = MESCal.buildYear(y);
				Object.keys(m).forEach(function (k) { m[k].forEach(function (e) { if (e.g === state.region && e.k === 'holiday') { var p = DC.parseISO(k); if (p) { var dn = DC.utcMs(p.y, p.m, p.d) / DAY; if (!set[dn]) { set[dn] = e.t; } } } }); });
			}
		}
		(state.hol.match(/\d{4}-\d{2}-\d{2}/g) || []).forEach(function (s) { var p = DC.parseISO(s); if (p) set[DC.utcMs(p.y, p.m, p.d) / DAY] = 'Day off'; });
		return set;
	}

	/* ---------- main ---------- */
	var last = null;
	function update() {
		var A = readMs('db-a', 'db-ta'), B = readMs('db-b', 'db-tb');
		if (A == null || B == null) { $('db-big').textContent = '—'; $('db-sub').textContent = 'Pick a start and an end date.'; ['db-breakdown', 'db-totals', 'db-work', 'db-info-a', 'db-info-b', 'db-mile'].forEach(function (i) { $(i).innerHTML = ''; }); $('db-bar').hidden = true; last = null; return; }
		var swapped = B < A; if (swapped) { var t = A; A = B; B = t; }
		var incl = state.incl && !state.time, Beff = incl ? B + DAY : B, D = Beff - A, sel = selUnits();
		var totalDays = D / DAY, wholeDays = Math.floor(totalDays), time = state.time;
		var bd = DC.breakdown(A, Beff, sel);
		// hero
		var heroText = time ? DC.breakdown(A, Beff, { d: true, h: true, n: true, s: true }).text : N(wholeDays) + (wholeDays === 1 ? ' day' : ' days');
		$('db-big').textContent = heroText;
		var dirNote = '';
		var today = todayMs() + (time ? 0 : 0);
		$('db-sub').innerHTML = esc(fmtDate(A, time)) + '<br>to ' + esc(fmtDate(B, time)) + '<br><span class="tu-note">' + (incl ? 'End date included (both days counted)' : time ? 'Clock difference' : 'End date not counted') + (swapped ? ' &middot; the dates were in reverse order' : '') + '</span>';
		var span = Beff - A;
		if (span > 0 && today >= A && today <= Beff) { var pct = Math.min(100, Math.max(0, (today - A) / span * 100)); $('db-bar').hidden = false; $('db-barfill').style.width = pct + '%'; $('db-sub').innerHTML += '<br>Today is ' + N(pct) + '% of the way (' + N((Beff - today) / DAY) + ' days left)'; } else $('db-bar').hidden = true;
		// breakdown
		$('db-breakdown').textContent = bd.text;
		// totals
		var months = DC.wholeMonths(A, Beff), baseM = DC.addMonths(A, months), mfrac = months + (Beff - baseM) / (DC.addMonths(baseM, 1) - baseM);
		var h = stat('Days', N(totalDays), '', true) + stat('Weeks', N(totalDays / 7), N(Math.floor(totalDays / 7)) + ' weeks ' + N(totalDays - Math.floor(totalDays / 7) * 7) + ' days') + stat('Months', N(mfrac), 'calendar months') + stat('Years', N(mfrac / 12), 'about ' + N(totalDays / 365.25) + ' by 365.25-day years');
		h += stat('Hours', N(D / 3600000)) + stat('Minutes', N(D / 60000)) + stat('Seconds', N(D / 1000));
		$('db-totals').innerHTML = h;
		// business days
		var startDay = Math.floor(A / DAY), n = Math.max(0, Math.floor(Beff / DAY) - startDay + (time && Beff % DAY ? 1 : 0)), hol = holidaySet(A, Beff);
		var wc = DC.workCount(startDay, n, state.weekend, hol);
		$('db-work').innerHTML = stat('Business days', N(wc.work), 'days that are not a weekend or holiday', true) + stat('Weekend days', N(wc.weekend), state.weekend.map(function (d) { return WD[d]; }).join(' + ') || 'none selected') + stat('Holidays skipped', N(wc.holidays.length), state.region || state.hol ? 'on working days' : 'none selected');
		$('db-hol-list').innerHTML = wc.holidays.length ? '<strong>Skipped:</strong> ' + wc.holidays.slice(0, 40).map(function (dn) { return esc(DC.iso(dn * DAY) + ' ' + hol[dn]); }).join(' &middot; ') + (wc.holidays.length > 40 ? ' …' : '') : '';
		// details
		function info(ms) {
			var p = DC.parts(ms), w = DC.isoWeek(ms), left = (DC.isLeap(p.y) ? 366 : 365) - DC.dayOfYear(ms);
			return '<div class="db-info"><div><span>Date</span><span>' + esc(fmtDate(ms, time)) + '</span></div><div><span>Day of the year</span><span>' + DC.dayOfYear(ms) + ' of ' + (DC.isLeap(p.y) ? 366 : 365) + '</span></div><div><span>ISO week</span><span>Week ' + w.week + ', ' + w.year + '</span></div><div><span>Days left in the year</span><span>' + left + '</span></div><div><span>Leap year</span><span>' + (DC.isLeap(p.y) ? 'Yes' : 'No') + '</span></div></div>';
		}
		$('db-info-a').innerHTML = info(A); $('db-info-b').innerHTML = info(B);
		var wcnt = DC.weekdayCounts(startDay, n);
		$('db-wdays').querySelector('thead tr').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<th>' + WD[d] + '</th>'; }).join('');
		$('db-wdays').querySelector('tbody tr').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<td>' + N(wcnt[d]) + '</td>'; }).join('');
		var mid = A + Math.floor(span / 2 / DAY) * DAY;
		var ms = [['Halfway point', mid], ['100 days after the start', A + 100 * DAY], ['1,000 days after the start', A + 1000 * DAY], ['10,000 days after the start', A + 10000 * DAY], ['One year after the end', DC.addMonths(B, 12)]];
		$('db-mile').innerHTML = ms.map(function (m) { return '<li><span>' + m[0] + '</span><strong>' + esc(fmtDate(m[1], false)) + '</strong></li>'; }).join('');
		// DST note
		var dst = $('db-dst');
		if (time) {
			try { var el = DC.wallToUtc(Beff, state.zone) - DC.wallToUtc(A, state.zone), diff = el - D; dst.textContent = diff ? 'A daylight-saving change falls inside this period: the real elapsed time is ' + DC.breakdown(0, el, { d: true, h: true, n: true, s: true }).text + ' (' + (diff > 0 ? '+' : '−') + N(Math.abs(diff) / 3600000) + ' h versus the clock difference).' : 'No daylight-saving change falls inside this period, so the clock difference equals the real elapsed time.'; } catch (e) {}
		} else dst.textContent = 'Turn on “Include time of day” to compare clock time with real elapsed time across daylight-saving changes.';
		last = { text: heroText + ' (' + bd.text + ') from ' + fmtDate(A, time) + ' to ' + fmtDate(B, time) + (incl ? ', end date included' : '') };
	}

	/* ---------- wiring ---------- */
	function sync() {
		$('db-ta-wrap').hidden = $('db-tb-wrap').hidden = !state.time; $('db-incl').disabled = state.time; $('db-time').checked = state.time; $('db-incl').checked = state.incl && !state.time;
		var cur = Object.keys(selUnits()).sort().join('');
		Array.prototype.forEach.call($('db-presets').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.p.split('').sort().join('') === cur)); });
	}
	function changed() { var u = Object.keys(selUnits()); state.units = u.length ? UNITS.map(function (x) { return x[0]; }).filter(function (c) { return u.indexOf(c) >= 0; }).join('') : 'd'; sync(); update(); save(); }
	['db-a', 'db-b', 'db-ta', 'db-tb'].forEach(function (id) { $(id).addEventListener('input', changed); $(id).addEventListener('change', changed); });
	$('db-incl').addEventListener('change', function () { state.incl = this.checked; changed(); });
	$('db-time').addEventListener('change', function () { state.time = this.checked; changed(); });
	$('db-units').addEventListener('change', changed);
	$('db-presets').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; setUnits(b.dataset.p); changed(); });
	$('db-wk').addEventListener('change', function () { state.weekend = Array.prototype.filter.call($('db-wk').querySelectorAll('input'), function (i) { return i.checked; }).map(function (i) { return +i.dataset.wd; }); changed(); });
	$('db-region').addEventListener('change', function () { state.region = this.value; changed(); });
	$('db-hol').addEventListener('input', function () { state.hol = this.value; changed(); });
	$('db-zone').addEventListener('change', function () { state.zone = this.value; changed(); });
	function setDate(id, ms) { $(id).value = DC.iso(ms); }
	$('db-a-today').addEventListener('click', function () { setDate('db-a', todayMs()); changed(); });
	$('db-b-today').addEventListener('click', function () { setDate('db-b', todayMs()); changed(); });
	$('db-swap').addEventListener('click', function () { var a = $('db-a').value, b = $('db-b').value, ta = $('db-ta').value, tb = $('db-tb').value; $('db-a').value = b; $('db-b').value = a; $('db-ta').value = tb; $('db-tb').value = ta; changed(); });
	$('db-quick').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var q = QR[+b.dataset.q]; setDate('db-a', q[1]); setDate('db-b', q[2]); changed(); });
	function wallNow(z) {
		var n = new Date();
		if (z === 'local') return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate(), h: n.getHours(), mi: n.getMinutes(), s: n.getSeconds() };
		var f = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }), o = {};
		f.formatToParts(n).forEach(function (q) { o[q.type] = +q.value; });
		return { y: o.year, m: o.month - 1, d: o.day, h: o.hour, mi: o.minute, s: o.second };
	}
	$('db-now').addEventListener('click', function () {
		var p; try { p = wallNow(state.zone); } catch (e) { return; }
		state.time = true; setDate('db-a', DC.utcMs(p.y, p.m, p.d)); $('db-ta').value = ('0' + p.h).slice(-2) + ':' + ('0' + p.mi).slice(-2) + ':' + ('0' + p.s).slice(-2); changed();
	});
	$('db-copy').addEventListener('click', function () { if (last) copy(last.text, 'Result copied'); });
	$('db-link').addEventListener('click', function () {
		var q = new URLSearchParams(); q.set('start', $('db-a').value); q.set('end', $('db-b').value);
		if (state.incl) q.set('incl', '1'); if (state.time) { q.set('st', $('db-ta').value); q.set('et', $('db-tb').value); }
		q.set('u', state.units); if (state.region) q.set('region', state.region); if (state.weekend.slice().sort().join() !== '0,6') q.set('wk', state.weekend.join(''));
		copy(location.origin + location.pathname + '?' + q.toString(), 'Link copied');
	});

	/* ---------- start-up ---------- */
	var q = new URLSearchParams(location.search), today = todayMs(), t0 = DC.parts(today);
	var a0 = DC.parseISO(q.get('start')), b0 = DC.parseISO(q.get('end'));
	setDate('db-a', a0 ? DC.utcMs(a0.y, a0.m, a0.d) : today);
	setDate('db-b', b0 ? DC.utcMs(b0.y, b0.m, b0.d) : DC.utcMs(t0.y + 1, 0, 1));
	if (q.get('incl') === '1') state.incl = true;
	if (q.get('st') || q.get('et')) { state.time = true; $('db-ta').value = q.get('st') || '00:00:00'; $('db-tb').value = q.get('et') || '00:00:00'; }
	if (q.get('u') && /^[ymwdhns]+$/.test(q.get('u'))) state.units = q.get('u');
	if (q.get('region') && /^(ca|us|uk|au|vn)$/.test(q.get('region'))) state.region = q.get('region');
	if (q.get('wk') && /^[0-6]+$/.test(q.get('wk'))) state.weekend = q.get('wk').split('').map(Number);
	setUnits(state.units); Array.prototype.forEach.call($('db-wk').querySelectorAll('input'), function (i) { i.checked = state.weekend.indexOf(+i.dataset.wd) >= 0; });
	$('db-region').value = state.region; $('db-hol').value = state.hol; if ($('db-zone').querySelector('option[value="' + state.zone + '"]')) $('db-zone').value = state.zone;
	sync(); update();
})();
