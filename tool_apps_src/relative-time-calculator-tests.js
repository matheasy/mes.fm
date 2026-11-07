// node tool_apps_src/relative-time-calculator-tests.js
const RT = require("./relative-time-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? (isFinite(b) ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(b)) : a === b) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
const { HOUR, DAY, WEEK, YEAR, MONTH, MIN } = RT;
// parsing
eq(RT.parse("1 hour"), HOUR, "1 hour"); eq(RT.parse("9 weeks"), 9 * WEEK, "9 weeks"); eq(RT.parse("70 years"), 70 * YEAR, "70 years"); eq(RT.parse("70y"), 70 * YEAR, "70y");
eq(RT.parse("1h 30m"), 5400, "1h 30m"); eq(RT.parse("1h30min"), 5400, "1h30min"); eq(RT.parse("1:30"), 5400, "1:30"); eq(RT.parse("2.5 days"), 2.5 * DAY, "2.5 days"); eq(RT.parse("2,5 days"), 2.5 * DAY, "decimal comma");
eq(RT.parse("an hour"), HOUR, "an hour"); eq(RT.parse("half an hour"), 1800, "half an hour"); eq(RT.parse("a summer"), YEAR / 4, "a summer"); eq(RT.parse("1 year and 6 months"), 1.5 * YEAR, "1 year and 6 months");
eq(RT.parse("1,200 years"), 1200 * YEAR, "thousands comma"); eq(RT.parse("3 months"), 3 * MONTH, "months"); eq(RT.parse("1 school year"), 10 * MONTH, "school year"); eq(RT.parse("one day"), DAY, "word number"); eq(RT.parse("10 min"), 600, "10 min");
eq(RT.parse("6", YEAR), 6 * YEAR, "bare number default unit"); eq(RT.parse("6"), null, "bare number no default"); eq(RT.parse(""), null, "empty"); eq(RT.parse("banana"), null, "junk"); eq(RT.parse("0 hours"), null, "zero"); eq(RT.parse("-5 h"), 5 * HOUR, "dash ignored"); eq(RT.parse("1 hour 30"), null, "dangling number");
// the user's example: 1 hour at 9 weeks vs 70 years -> 16.9 days (share model)
const d1 = RT.equiv(HOUR, 9 * WEEK, 70 * YEAR, 1); eq(d1 / DAY, 70 * 365.2425 / 63 / 24, "share model exact"); eq(Math.round(d1 / DAY * 10) / 10, 16.9, "about 16.9 days");
eq(RT.fmt(d1), "16.9 days", "fmt"); eq(RT.breakdown(d1), "16 days 21 hours", "breakdown");
// clock model: identity
eq(RT.equiv(HOUR, 9 * WEEK, 70 * YEAR, 0), HOUR, "clock identity");
// sqrt model small span ~ d * sqrt(B/A)
eq(RT.equiv(HOUR, 9 * WEEK, 70 * YEAR, 0.5) / HOUR, Math.sqrt(70 * 365.2425 / 63), "sqrt small-span", 1e-3);
// big span exact forms
eq(RT.equiv(YEAR, YEAR, 10 * YEAR, 0.5), (Math.sqrt(10) + Math.sqrt(2) - 1) ** 2 * YEAR - 10 * YEAR, "sqrt big span exact", 1e-9);
eq(RT.equiv(YEAR, 5 * YEAR, 50 * YEAR, 1), 10 * YEAR, "share big span = d*B/A");
// symmetry: going there and back returns the same span, for several k
[0, 0.25, 0.5, 0.75, 0.999999, 1, 1.5].forEach(k => { const there = RT.equiv(3 * MONTH, 6 * YEAR, 40 * YEAR, k); eq(RT.equiv(there, 40 * YEAR, 6 * YEAR, k), 3 * MONTH, "round trip k=" + k, 1e-8); });
// continuity at k = 1
eq(RT.equiv(DAY, 2 * YEAR, 30 * YEAR, 1 - 1e-7), RT.equiv(DAY, 2 * YEAR, 30 * YEAR, 1), "continuous at k=1", 1e-5);
// monotone in k when B > A
eq(RT.equiv(HOUR, YEAR, 50 * YEAR, 0.3) < RT.equiv(HOUR, YEAR, 50 * YEAR, 0.7), true, "older feels faster with more k");
eq(RT.equiv(HOUR, 50 * YEAR, YEAR, 1), HOUR / 50, "younger: span shrinks");
eq(isNaN(RT.equiv(0, 1, 1, 1)), true, "invalid -> NaN"); eq(RT.ratio(9 * WEEK, 70 * YEAR, 1), 70 * YEAR / (9 * WEEK), "ratio");
// felt life
eq(RT.halfway(80, 1, 5), 20, "half of felt life at 20 (memories from 5, life 80)"); eq(RT.feltShare(20, 80, 1, 5), 0.5, "felt share 20"); eq(RT.feltShare(3, 80, 1, 5), 0, "before memories"); eq(RT.feltShare(90, 80, 1, 5), 1, "after lifespan");
eq(RT.halfway(80, 0, 0), 40, "clock halfway = half"); eq(RT.halfway(80, 0.5, 0), 20, "sqrt halfway from 0 = L/4"); eq(RT.feltShare(RT.halfway(80, 0.5, 5), 80, 0.5, 5), 0.5, "sqrt halfway consistent");
eq(RT.feltShare(40, 80, 0.999999999, 5), RT.feltShare(40, 80, 1, 5), "feltShare continuous", 1e-6);
// lifespans
eq(RT.lifespanEquiv(DAY, 12 * YEAR, 79 * YEAR) / DAY, 79 / 12, "dog day"); eq(RT.lifespan("dog").life, 12 * YEAR, "dog lifespan"); eq(RT.lifespan("nope"), null, "no lifespan");
// formatting
eq(RT.fmt(HOUR), "1 hour", "1 hour"); eq(RT.fmt(90 * MIN), "1.5 hours", "1.5 hours"); eq(RT.fmt(3 * WEEK), "21 days", "days under 4 weeks"); eq(RT.fmt(9 * WEEK), "9 weeks", "weeks"); eq(RT.fmt(70 * YEAR), "70 years", "years"); eq(RT.fmt(0.5), "500 ms", "ms"); eq(RT.fmt(12345 * YEAR), "12,345 years", "thousands"); eq(RT.fmt(Infinity), "forever", "inf");
eq(RT.short(HOUR), "1h", "short h"); eq(RT.short(9 * WEEK), "9w", "short w"); eq(RT.short(70 * YEAR), "70y", "short y"); eq(RT.parse(RT.short(3 * MONTH)), 3 * MONTH, "short round trip"); eq(RT.short(5400), "1.5h", "short 1.5h");
RT.EXAMPLES.forEach(e => { if (e.m === "age") { eq(RT.parse(e.d) > 0 && RT.parse(e.a) > 0 && RT.parse(e.b) > 0, true, "example parses: " + e.label); } else eq(!!(RT.lifespan(e.la) && RT.lifespan(e.lb) && RT.parse(e.d)), true, "example: " + e.label); });
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
