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
