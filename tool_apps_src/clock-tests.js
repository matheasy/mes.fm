// node tool_apps_src/clock-tests.js
const CK = require("./clock/lib.js");
let f = 0, n = 0; function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b)); } }
const d = new Date(Date.UTC(2026, 9, 6, 22, 30, 15, 250));     // 6 Oct 2026 22:30:15.250 UTC (a Tuesday)
eq(CK.partsIn(d, "UTC"), { y: 2026, mo: 10, d: 6, h: 22, m: 30, s: 15, ms: 250, wd: 2 }, "UTC parts");
eq(CK.partsIn(d, "America/Vancouver").h, 15, "Vancouver is UTC-7 in October (PDT)"); eq(CK.partsIn(d, "Asia/Tokyo").d, 7, "Tokyo is already the 7th"); eq(CK.partsIn(d, "Asia/Kolkata").m, 0, "Kolkata +5:30 -> 04:00");
eq(CK.offsetMin(d, "America/Vancouver"), -420, "PDT offset"); eq(CK.offsetMin(d, "Asia/Kolkata"), 330, "IST offset"); eq(CK.offsetMin(d, "UTC"), 0, "UTC offset");
const w = new Date(Date.UTC(2026, 0, 15, 12, 0, 0)); eq(CK.offsetMin(w, "America/Vancouver"), -480, "PST in winter"); eq(CK.offsetMin(w, "Europe/London"), 0, "GMT in winter");
eq(CK.offsetLabel(-420), "UTC-7", "label"); eq(CK.offsetLabel(330), "UTC+5:30", "label half"); eq(CK.offsetLabel(0), "UTC+0", "label 0");
eq(CK.timeText({ h: 15, m: 5, s: 9 }, true, true), "3:05:09 PM", "12h"); eq(CK.timeText({ h: 0, m: 5, s: 9 }, true, false), "12:05 AM", "midnight 12h"); eq(CK.timeText({ h: 15, m: 5, s: 9 }, false, true), "15:05:09", "24h"); eq(CK.timeText({ h: 9, m: 0, s: 0 }, false, false), "09:00", "24h pad");
eq(CK.angles({ h: 3, m: 0, s: 0, ms: 0 }), { hour: 90, min: 0, sec: 0 }, "3 o'clock"); eq(CK.angles({ h: 12, m: 30, s: 0, ms: 0 }), { hour: 15, min: 180, sec: 0 }, "12:30"); eq(CK.angles({ h: 0, m: 0, s: 30, ms: 500 }, true).sec, 183, "smooth second hand");
eq(CK.dayOfYear(2026, 1, 1), 1, "doy 1"); eq(CK.dayOfYear(2026, 10, 6), 279, "doy Oct 6"); eq(CK.dayOfYear(2028, 12, 31), 366, "leap");
eq(CK.isoWeek(2026, 1, 1), 1, "week 1"); eq(CK.isoWeek(2026, 10, 6), 41, "week 41"); eq(CK.isoWeek(2021, 1, 3), 53, "ISO week 53 of 2020");
eq(CK.city("America/Argentina/Buenos_Aires"), "Buenos Aires", "city"); eq(CK.diffText(0, -420), "7 h ahead of", "ahead"); eq(CK.diffText(-420, 330), "12 h 30 min behind", "behind"); eq(CK.diffText(60, 60), "same time as", "same");
eq(CK.valid("Asia/Tokyo"), true, "valid"); eq(CK.valid("Mars/Olympus"), false, "invalid"); eq(CK.isDay({ h: 6 }), true, "day"); eq(CK.isDay({ h: 18 }), false, "night");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
