/* node tool_apps_src/zodiac-tests.js -- checks the maths of mes.fm/zodiac (tool_apps_src/zodiac/lib.js) */
const assert = require("assert");
global.Astronomy = require("../mes.fm/moon/js/astronomy.browser.min.js");
const Z = require("./zodiac/lib.js");
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const near = (a, b, tol, m) => ok(Math.abs(Z.wrap(a - b + 180) - 180) <= tol, m + ": " + a.toFixed(3) + " vs " + b);
// Einstein, 14 Mar 1879 11:30 local mean time, Ulm (48.40 N, 9.99 E = UTC+0:40). Published chart: Sun 23°30' Pisces, Moon 14°32' Sagittarius, Asc 11°38' Cancer, MC 12°50' Pisces
const e = Z.chart({ y: 1879, mo: 3, d: 14, h: 11, m: 30, tz: "+00:40", lat: 48.40, lon: 9.99 });
near(e.by.sun.lon, 330 + 23.5, 0.05, "Einstein Sun"); near(e.by.moon.lon, 240 + 14.53, 0.3, "Einstein Moon");
near(e.asc, 90 + 11.63, 0.5, "Einstein Asc"); near(e.mc, 330 + 12.83, 0.3, "Einstein MC");
ok(e.ascSign.sign.name === "Cancer" && e.houseMode === "whole" && e.cusps[0] === 90, "whole-sign cusps start at the Asc sign");
ok(e.by.sun.house === 9 || e.by.sun.house === 10, "Einstein Sun in house 9/10 (whole sign): " + e.by.sun.house);
const eq = Z.chart({ y: 1879, mo: 3, d: 14, h: 11, m: 30, tz: "+00:40", lat: 48.40, lon: 9.99, houses: "equal" });
near(eq.cusps[0], eq.asc, 1e-9, "equal house 1 = Asc"); near(eq.cusps[3], eq.asc + 90, 1e-9, "equal house 4");
// Sun signs
const c = Z.chart({ y: 1947, mo: 10, d: 26, tz: "America/Chicago" });
ok(c.by.sun.sign.name === "Scorpio", "Clinton Sun Scorpio"); ok(!c.timeKnown && c.asc === undefined, "no Asc without a time");
ok(Z.chart({ y: 1942, mo: 10, d: 21, tz: "America/New_York" }).by.sun.sign.name === "Libra", "21 Oct 1942 Libra");
ok(Z.chart({ y: 2000, mo: 1, d: 1, h: 12, m: 0, tz: "UTC" }).by.sun.sign.name === "Capricorn", "1 Jan 2000 Capricorn");
near(Z.chart({ y: 2000, mo: 1, d: 1, h: 12, m: 0, tz: "UTC" }).by.sun.lon, 280.37, 0.05, "J2000 Sun longitude");
// Moon change during the day is reported when no time is given (Moon enters a sign every ~2.3 days)
let amb = 0; for (let d = 1; d <= 28; d++) if (Z.chart({ y: 2026, mo: 2, d, tz: "UTC" }).ambiguous.some(a => a.id === "moon")) amb++;
ok(amb >= 9 && amb <= 14, "moon sign changes on ~12 of 28 days: " + amb);
const am = Z.chart({ y: 2026, mo: 2, d: 1, tz: "UTC" }).ambiguous.concat(Z.chart({ y: 2026, mo: 2, d: 2, tz: "UTC" }).ambiguous).find(a => a.id === "moon");
if (am) { const before = Z.signOf(Z.lonOf("moon", new Date(am.at - 120000))).i, after = Z.signOf(Z.lonOf("moon", new Date(am.at + 60000))).i; ok(before !== after, "change instant brackets the ingress"); }
// retrograde: Mercury was retrograde on 2026-03-05 (station 26 Feb - 20 Mar 2026), direct on 2026-04-15
ok(Z.chart({ y: 2026, mo: 3, d: 5, h: 12, m: 0, tz: "UTC" }).by.mercury.retro, "Mercury Rx Mar 2026");
ok(!Z.chart({ y: 2026, mo: 4, d: 15, h: 12, m: 0, tz: "UTC" }).by.mercury.retro, "Mercury direct Apr 2026");
ok(!Z.chart({ y: 2026, mo: 4, d: 15, h: 12, m: 0, tz: "UTC" }).by.sun.retro, "Sun never retrograde");
// Moon phase: full moon 2026-10-26 04:12 UTC
const fm = Z.chart({ y: 2026, mo: 10, d: 26, h: 4, m: 12, tz: "UTC" }); ok(fm.phase.name === "Full Moon" && fm.phase.illum > 0.99, "full moon");
// Chinese zodiac by Lunar New Year, not 1 Jan
ok(Z.chinese(1947, 10, 26).animal === "Pig" && Z.chinese(1947, 10, 26).element === "Fire", "1947 Fire Pig");
ok(Z.chinese(1980, 2, 10).animal === "Goat", "10 Feb 1980 still Goat (LNY 16 Feb)");
ok(Z.chinese(1980, 2, 16).animal === "Monkey" && Z.chinese(1980, 2, 16).element === "Metal", "16 Feb 1980 Metal Monkey");
ok(Z.chinese(2024, 2, 9).animal === "Rabbit" && Z.chinese(2024, 2, 10).animal === "Dragon", "2024 Dragon from 10 Feb");
const ny = [[2020, 1, 25], [2021, 2, 12], [2022, 2, 1], [2023, 1, 22], [2025, 1, 29], [2026, 2, 17], [2027, 2, 6], [1949, 1, 29], [1900, 1, 31]];
ny.forEach(([y, mo, d]) => { const r = Z.lunarNewYear(y); ok(r && r.mo === mo && r.d === d, "LNY " + y + " " + JSON.stringify(r)); });
ok(Z.chinese(1949, 10, 21).animal === "Ox" && Z.chinese(1942, 10, 21).animal === "Horse", "Netanyahu Ox, Sheindlin Horse");
// parsing
const P = Z.parseDate;
ok(JSON.stringify(P("1980-10-26")) === '{"y":1980,"mo":10,"d":26}' && JSON.stringify(P("10-26")) === '{"mo":10,"d":26}', "iso / md");
ok(P("Oct 26, 1947").y === 1947 && P("26 October").mo === 10 && P("26th of Oct 1947").d === 26 && P("10/26/1947").mo === 10 && P("26.10.1947").mo === 10, "text dates");
ok(P("02-30") === null && P("1900-02-29") === null && P("2000-02-29").d === 29 && P("") === null && P("hello") === null, "invalid dates");
ok(Z.parseTime("6:30 pm").h === 18 && Z.parseTime("0630").h === 6 && Z.parseTime("12am").h === 0 && Z.parseTime("noon").h === 12 && Z.parseTime("25:00") === null, "times");
// zones: DST-aware wall -> UTC, fixed offsets
ok(Z.wallToUtc(2026, 7, 1, 12, 0, "America/Vancouver") === Date.UTC(2026, 6, 1, 19), "PDT");
ok(Z.wallToUtc(2026, 1, 1, 12, 0, "America/Vancouver") === Date.UTC(2026, 0, 1, 20), "PST");
ok(Z.wallToUtc(2026, 1, 1, 12, 0, "+05:30") === Date.UTC(2026, 0, 1, 6, 30) && Z.fixedOffset("UTC-8") === -480 && Z.fixedOffset("Vancouver") === null, "fixed offsets");
// sign day ranges
ok(Z.sunSignByDay(10, 26).name === "Scorpio" && Z.sunSignByDay(10, 22).name === "Libra" && Z.sunSignByDay(1, 1).name === "Capricorn" && Z.sunSignByDay(3, 21).name === "Aries", "sun sign by day");
ok(JSON.stringify(Z.signDays(9)) === "[[12,22,31],[1,1,19]]" && JSON.stringify(Z.signDays(7)) === "[[10,23,31],[11,1,21]]", "sign day ranges");
for (let i = 0; i < 12; i++) Z.signDays(i).forEach(([mo, a, b]) => { for (let d = a; d <= b; d++) ok(Z.sunSignByDay(mo, d).i === i, "range " + i); });
// quick (celebrities: no time)
const q = Z.quick(1947, 10, 26); ok(q.sun.name === "Scorpio" && !q.sunAlt && q.chinese.animal === "Pig", "quick Clinton");
ok(Z.quick(1942, 10, 23).sunAlt || Z.quick(1942, 10, 24).sunAlt || Z.quick(1942, 10, 23).sun.name === "Scorpio", "cusp day flagged or clear");
// places
ok(Z.findCities("vanc")[0].name === "Vancouver" && Z.findCities("london")[0].country === "United Kingdom" && Z.findCities("zzzz").length === 0, "city search");
Z.CITIES.forEach(c => ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180 && Z.validZone(c.tz), "city " + c.name + " " + c.tz));
ok(JSON.stringify(Z.parseLatLon("49.28, -123.12")) === '{"lat":49.28,"lon":-123.12}', "latlon decimal");
const dms = Z.parseLatLon("49°17'N 123°7'W"); ok(Math.abs(dms.lat - 49.2833) < 1e-3 && Math.abs(dms.lon + 123.1167) < 1e-3, "latlon dms");
ok(Z.parseLatLon("95, 10") === null && Z.parseLatLon("x") === null, "latlon invalid");
console.log("zodiac tests: " + n + " checks passed");
