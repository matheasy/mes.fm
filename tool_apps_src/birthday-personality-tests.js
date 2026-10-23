/* node tool_apps_src/birthday-personality-tests.js -- checks mes.fm/birthday-personality (tool_apps_src/birthday-personality/lib.js) */
const assert = require("assert");
const B = require("./birthday-personality/lib.js");
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
// every day of a leap year: a profile with every field filled
const titles = new Set(), FIELDS = ["title", "summary", "love", "work", "motto", "advice", "luckyColour", "luckyDay", "element", "modality", "ruler", "numberName", "date", "forFun"];
function noEmpty(v, where) {
	if (typeof v === "string") ok(v.trim().length > 0 && !/undefined|null|NaN|\s\s/.test(v), "bad string at " + where + ": " + JSON.stringify(v));
	else if (Array.isArray(v)) v.forEach((x, i) => noEmpty(x, where + "[" + i + "]"));
	else if (v && typeof v === "object") Object.keys(v).forEach((k) => noEmpty(v[k], where + "." + k));
}
for (let i = 1; i <= 366; i++) {
	const t = B.fromDoy(i), p = B.profile(t.mo, t.d, 2026), w = t.mo + "/" + t.d;
	ok(p && p.mo === t.mo && p.d === t.d, "profile " + w);
	FIELDS.forEach((f) => ok(typeof p[f] === "string" && p[f].length > 1, w + " " + f));
	ok(/^The [A-Z]/.test(p.title), w + " title starts with The: " + p.title);
	titles.add(p.title);
	const sent = p.summary.match(/[^.!?]+[.!?]+/g) || [];
	ok(sent.length >= 3 && sent.length <= 4, w + " summary has 3-4 sentences (" + sent.length + ")");
	ok(p.strengths.length === 4 && new Set(p.strengths).size === 4, w + " 4 different strengths");
	ok(p.challenges.length === 3 && new Set(p.challenges).size === 3, w + " 3 different challenges");
	ok(p.strengths.every((s) => p.challenges.indexOf(s) < 0), w + " strengths and challenges differ");
	ok((p.love.match(/[.!?](\s|$)/g) || []).length === 2 && (p.work.match(/[.!?](\s|$)/g) || []).length === 2, w + " love / work are 2 sentences");
	ok(p.luckyNumbers.length >= 3 && p.luckyNumbers.every((x) => x >= 1 && x <= 49 && Number.isInteger(x)), w + " lucky numbers");
	ok(p.matches.length === 3 && p.matches.every((m) => B.valid(m.mo, m.d) && m.title && m.sign === B.signOf(m.mo, m.d).name), w + " matches");
	ok(p.matches[2].sign === B.SIGNS[(p.sign.i + 6) % 12].name, w + " opposite match");
	ok(p.matches[0].sign !== p.sign.name && B.signOf(p.matches[0].mo, p.matches[0].d).element === p.element, w + " same-element match");
	ok(p.birthDayNumber >= 1 && p.birthDayNumber <= 9, w + " birth-day number 1-9");
	ok(p.decan.n >= 1 && p.decan.n <= 3, w + " decan");
	ok(p.yearAhead.year === 2026 && p.yearAhead.number >= 1 && p.yearAhead.number <= 9, w + " year ahead");
	noEmpty(p, w);
	ok(JSON.stringify(p) === JSON.stringify(B.profile(t.mo, t.d, 2026)), w + " deterministic");
}
ok(titles.size === 366, "366 unique titles (" + titles.size + ")");
// neighbours read differently
for (let i = 1; i < 366; i++) {
	const a = B.fromDoy(i), b = B.fromDoy(i + 1), pa = B.profile(a.mo, a.d, 2026), pb = B.profile(b.mo, b.d, 2026);
	ok(pa.summary !== pb.summary && pa.motto !== pb.motto && pa.love !== pb.love, "adjacent days differ " + a.mo + "/" + a.d);
}
// a different year changes the forecast only
ok(B.profile(5, 5, 2026).yearAhead.text !== B.profile(5, 5, 2027).yearAhead.text && B.profile(5, 5, 2026).summary === B.profile(5, 5, 2027).summary, "forecast changes yearly");
// 29 February
const f = B.profile(2, 29, 2026);
ok(f.title === "The Leap-Day Original" && f.sign.name === "Pisces" && /rarest birthday/.test(f.summary), "Feb 29 special entry");
ok(B.profile(2, 30) === null && B.profile(13, 1) === null && B.profile(4, 31) === null && B.profile(0, 5) === null, "invalid dates");
ok(B.yearProfile(2023, 2, 29) === null && B.yearProfile(2024, 2, 29).age >= 0, "Feb 29 only in leap years");
// signs, decans, cusps
ok(B.signOf(3, 21).name === "Aries" && B.signOf(3, 20).name === "Pisces" && B.signOf(12, 22).name === "Capricorn" && B.signOf(1, 19).name === "Capricorn" && B.signOf(1, 20).name === "Aquarius", "sign boundaries");
ok(B.decanOf(1, 15).n === 3 && B.decanOf(1, 15).co.name === "Virgo" && B.decanOf(3, 21).n === 1 && B.decanOf(4, 5).co.name === "Leo", "decans");
ok(B.cuspOf(3, 21) && B.cuspOf(3, 21).other.name === "Pisces" && B.cuspOf(4, 19).other.name === "Taurus" && B.cuspOf(4, 5) === null, "cusps");
ok(B.profile(3, 22, 2026).summary.split(/[.!?]\s/).length === 4, "cusp day has a 4th summary sentence");
// numerology
ok(B.reduce9(29) === 2 && B.reduceKeep(29) === 11 && B.reduceKeep(22) === 22 && B.reduce9(22) === 4 && B.reduce9(31) === 4 && B.reduce9(9) === 9, "day numbers");
ok(B.profile(11, 29, 2026).dayNumber === 11 && B.profile(11, 29, 2026).birthDayNumber === 2, "master day number shown, birth-day number reduced");
ok(B.lifePath(1980, 1, 15).n === 7, "life path 1980-01-15 = 1 + 6 + 9 = 16 -> 7");
ok(B.lifePath(1776, 7, 4).n === 5, "life path 1776-07-04 = 7 + 4 + 3 = 14 -> 5");
ok(B.lifePath(1990, 11, 29).n === 5, "life path 1990-11-29 = 11 + 11 + 1 = 23 -> 5");
ok(B.lifePath(2000, 2, 7).n === 11 && B.lifePath(2000, 2, 7).master, "life path 2000-02-07 = 2 + 7 + 2 = 11 (master)");
ok(B.lifePath(2000, 11, 9).n === 22, "life path 2000-11-09 = 11 + 9 + 2 = 22 (master)");
ok(B.lifePath(2009, 11, 29).n === 33, "life path 2009-11-29 = 11 + 11 + 11 = 33 (master)");
const lp = B.lifePath(1983, 2, 4);   // 2 + 4 + (21 -> 3) = 9
ok(lp.n === 9 && !lp.master, "life path 1983-02-04 = 9");
ok(B.lifePath(1985, 9, 9).n === 5, "life path 1985-09-09 = 9 + 9 + 5 = 23 -> 5");
// Chinese zodiac across Lunar New Year
const cz = (y, m, d) => B.chinese(y, m, d);
ok(cz(2024, 2, 9).animal === "Rabbit" && cz(2024, 2, 10).animal === "Dragon" && cz(2024, 2, 10).element === "Wood", "2024 Wood Dragon from Feb 10");
ok(cz(1985, 2, 19).animal === "Rat" && cz(1985, 2, 20).animal === "Ox", "1985 new year Feb 20 (corrected year)");
ok(cz(2025, 1, 29).animal === "Snake" && cz(2025, 1, 28).animal === "Dragon", "2025 Snake from Jan 29");
ok(cz(1980, 1, 15).animal === "Goat" && cz(1980, 1, 15).element === "Earth", "Jan 1980 = Earth Goat (1979 year)");
ok(cz(2033, 1, 31).animal === "Ox", "2033 Jan 31 Ox");
ok(B.lunarNewYear(1899) === null && cz(1850, 6, 1).approximate, "outside the table");
// yearProfile
const yp = B.yearProfile(1980, 1, 15, { y: 2026, mo: 1, d: 14 });
ok(yp.age === 45 && yp.yearAhead.year === 2025 && yp.lifePath.n === 7 && yp.chinese.animal === "Goat", "yearProfile before the birthday");
ok(B.yearProfile(1980, 1, 15, { y: 2026, mo: 1, d: 15 }).age === 46, "yearProfile on the birthday");
// search + short
ok(B.search("hero").length >= 1 && B.search("hero").every((e) => /hero/i.test(e.title + e.sign)), "search hero");
ok(B.search("dreamweaver").length >= 2, "search dreamweaver");
ok(B.search("zzzz").length === 0 && B.search("").length === 0, "search nothing");
const sh = B.short(10, 26);
ok(sh.title === B.titleOf(10, 26) && sh.url === "/birthday-personality?m=10&d=26" && (sh.text.match(/[.!?]/g) || []).length === 2, "short card text");
console.log("birthday-personality: " + n + " checks passed");
