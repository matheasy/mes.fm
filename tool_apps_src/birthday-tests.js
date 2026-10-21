/* node tool_apps_src/birthday-tests.js -- helpers of mes.fm/birthday (tool_apps_src/birthday/lib.js) checked against the real data files */
const assert = require("assert"), fs = require("fs"), path = require("path");
const B = require("./birthday/lib.js");
const D = path.join(__dirname, "../mes.fm/birthday/data/");
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const month = m => B.rows(JSON.parse(fs.readFileSync(D + B.pad(m) + ".json", "utf8")));
const index = JSON.parse(fs.readFileSync(D + "index.json", "utf8")).rows;
const today = { y: 2026, mo: 10, d: 21 };
// data shape
ok(index.length > 5000 && index.length < 12000, "index size " + index.length);
let total = 0, ids = new Set();
for (let m = 1; m <= 12; m++) {
	const l = month(m); total += l.length;
	l.forEach((p, i) => { ok(p.mo === m && p.d >= 1 && p.d <= 31 && p.name && p.id && !ids.has(p.id), "row " + p.name); ids.add(p.id); if (i) ok(l[i - 1].d < p.d || (l[i - 1].d === p.d && l[i - 1].rank < p.rank), "sorted " + p.name); ok(B.FIELDS[p.field], "field " + p.field); });
}
ok(total === index.length, "months = index");
// the people the user asked about, with Wikidata's dates
const oct = month(10), by = name => oct.find(p => p.name.indexOf(name) === 0);
ok(by("Hillary Clinton").dob === "1947-10-26", "Clinton 26 Oct 1947");
ok(by("Judy Sheindlin").dob === "1942-10-21", "Sheindlin 21 Oct 1942");
ok(by("Benjamin Netanyahu").dob === "1949-10-21", "Netanyahu 21 Oct 1949");
ok(by("John Hutchison").dob === "1945-10-19" && by("John Hutchison").link === "https://mes.fm/hutchison", "Hutchison (extras)");
ok(month(7).some(p => p.name === "Nikola Tesla" && p.dob === "1856-07-10"), "Tesla");
// day lists, filters
const d26 = oct.filter(p => p.d === 26);
ok(d26[0].rank <= d26[d26.length - 1].rank && d26.length > 10, "26 Oct list");
ok(B.filter(d26, { field: "politics" }, today).every(p => p.field === "politics"), "field filter");
ok(B.filter(d26, { alive: true }, today).every(p => !p.dod), "alive filter");
ok(B.filter(d26, { q: "clinton" }, today)[0].name === "Hillary Clinton", "text filter");
ok(B.filter(d26, { era: "m20" }, today).every(p => p.y >= 1946 && p.y <= 1969), "era filter");
const c = B.counts(d26, "field"); ok(Object.values(c).reduce((a, b) => a + b, 0) === d26.length, "counts add up");
ok(B.sortBy(d26, "old")[0].y <= B.sortBy(d26, "old")[1].y && B.sortBy(d26, "young")[0].y >= B.sortBy(d26, "young")[1].y, "sort by year");
// ages
const hc = by("Hillary Clinton");
ok(B.lifeText(hc, today) === "born 1947 (age 78)" && B.lifeText(hc, { y: 2026, mo: 10, d: 26 }) === "born 1947 (age 79)", "age around the birthday");
ok(B.lifeText({ y: 1856, mo: 7, d: 10, dod: "1943-01-07" }, today) === "1856–1943 (died at 86)", "age at death");
ok(B.lifeText({ y: 1800, mo: 1, d: 1, dod: "" }, today) === "born 1800" && !B.alive({ y: 1800, mo: 1, d: 1, dod: "" }, today), "no death date, very old");
// search
ok(B.search(index, "judge judy")[0].name.indexOf("Judy Sheindlin") === 0, "judge judy");
ok(B.search(index, "tesla")[0].name === "Nikola Tesla", "tesla");
ok(B.search(index, "hillary")[0].name === "Hillary Clinton", "hillary");
ok(B.search(index, "einstein")[0].name === "Albert Einstein", "einstein");
ok(B.search(index, "netanyahu")[0].name === "Benjamin Netanyahu", "netanyahu");
ok(B.search(index, "").length === 0 && B.search(index, "zzqqxx").length === 0, "empty search");
ok(B.norm("Björk Guðmundsdóttir") === "bjork gudmundsdottir" && B.norm("Lech Wałęsa") === "lech walesa", "accents folded");
// same year / nearest
const sy = B.sameYear(index, 1947, 10, 26, 10); ok(sy[0].name === "Hillary Clinton" && sy.every(p => p.y === 1947), "same year, same date first");
const nr = B.nearest(index, 10, 26, 30, 2); ok(nr.length === 30 && nr.every(p => p.gap >= 1 && p.gap <= 2 && !(p.mo === 10 && p.d === 26)), "nearest");
ok(nr.filter(p => p.gap === 1).every(p => (p.d === 25 || p.d === 27)), "gap 1 = 25 / 27 Oct");
ok(B.dayGap(12, 31, 1, 1) === 1 && B.dayGap(1, 1, 7, 2) === 183 && B.dayGap(2, 28, 3, 1) === 2, "circular gaps (29 Feb has a slot)");
ok(JSON.stringify(B.shift(12, 31, 1)) === '{"mo":1,"d":1}' && JSON.stringify(B.shift(3, 1, -1)) === '{"mo":2,"d":29}', "shift days");
// links
const q = B.fromQuery("?d=1980-10-26&q=x&f=music&e=l20&a=1&s=old&c=Canada"); ok(q.y === 1980 && q.mo === 10 && q.d === 26 && q.field === "music" && q.era === "l20" && q.alive && q.sort === "old" && q.country === "Canada", "fromQuery");
ok(B.fromQuery("?d=10-26").y === undefined && B.fromQuery("?d=02-30").mo === undefined && B.fromQuery("?f=evil").field === undefined, "bad params dropped");
ok(B.toQuery(q) === "d=1980-10-26&q=x&f=music&c=Canada&e=l20&a=1&s=old" && B.toQuery({ mo: 1, d: 5 }) === "d=01-05", "toQuery");
ok(B.wikiUrl({ wiki: "Hillary Clinton" }) === "https://en.wikipedia.org/wiki/Hillary_Clinton" && B.wikiUrl({ id: "Q1" }) === "https://www.wikidata.org/wiki/Q1", "links");
// portraits
const withImg = []; for (let m = 1; m <= 12; m++) month(m).forEach(p => { if (p.img) withImg.push(p); });
ok(withImg.length > 9000, "portraits " + withImg.length);
withImg.forEach(p => { ok(/^[0-9a-f]{2}\|[^|/]+\.(jpe?g|png|gif|svg|tiff?|webp)$/i.test(p.img), "img code " + p.img); });
const md5 = s => require("crypto").createHash("md5").update(s, "utf8").digest("hex");
withImg.slice(0, 300).forEach(p => ok(md5(p.img.slice(3)) .slice(0, 2) === p.img.slice(0, 2), "md5 prefix " + p.img));
ok(B.thumbUrl("ab|Foo_(bar),_1990.jpg") === "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo_(bar),_1990.jpg/120px-Foo_(bar),_1990.jpg", "thumb jpg");
ok(B.thumbUrl("ab|X.tif", 60).endsWith("/60px-X.tif.jpg") && B.thumbUrl("ab|X.svg").endsWith("/120px-X.svg.png") && B.thumbUrl("ab|X.webp").endsWith("/120px-X.webp"), "thumb tif / svg / webp");
ok(B.thumbUrl("ab|Café_Ø.jpg").includes("Caf%C3%A9_%C3%98.jpg") && B.thumbUrl("ab|A&B?.jpg").includes("A%26B%3F.jpg") && B.thumbUrl("") === "" && B.thumbUrl("x") === "", "thumb encoding / empty");
ok(B.commonsUrl("ab|Hillary_Clinton.jpg") === "https://commons.wikimedia.org/wiki/File:Hillary_Clinton.jpg", "commons link");
ok(B.initials("Judy Sheindlin (Judge Judy)") === "JS" && B.initials("Madonna") === "M", "initials");
// age gaps, next birthday, closest twin
const me = { y: 1980, mo: 10, d: 21 };
ok(B.ageGapText({ y: 1947, mo: 10, d: 26 }, me) === "32 years older than you" && B.ageGapText({ y: 1981, mo: 10, d: 21 }, me) === "1 year younger than you", "age gap years");
ok(B.ageGapText({ y: 1980, mo: 10, d: 21 }, me) === "born the same day as you" && B.ageGapText({ y: 1980, mo: 10, d: 26 }, me) === "5 days younger than you" && B.ageGapText({ y: 1980, mo: 3, d: 1 }, me) === "8 months older than you", "age gap short");
let nb = B.nextBirthday(10, 26, { y: 2026, mo: 10, d: 21 }, 1947); ok(nb.y === 2026 && nb.days === 5 && nb.turns === 79 && B.WEEKDAYS[nb.wd] === "Monday", "next birthday Clinton 2026");
nb = B.nextBirthday(10, 21, { y: 2026, mo: 10, d: 21 }, 1980); ok(nb.days === 0 && nb.turns === 46, "birthday today");
nb = B.nextBirthday(1, 5, { y: 2026, mo: 12, d: 30 }); ok(nb.y === 2027 && nb.days === 6, "next year");
nb = B.nextBirthday(2, 29, { y: 2026, mo: 1, d: 1 }, 2000); ok(nb.mo === 2 && nb.d === 28 && nb.turns === 26, "29 Feb in a common year");
nb = B.nextBirthday(2, 29, { y: 2028, mo: 1, d: 1 }); ok(nb.d === 29, "29 Feb in a leap year");
const tw = B.closestTwin(index, 1947, 10, 26); ok(tw.name === "Hillary Clinton" && tw.gap === 0, "closest twin same date");
const tw2 = B.closestTwin(index, 1947, 10, 26, [tw.id]); ok(tw2.gap >= 0 && tw2.id !== tw.id, "closest twin, next one");
// On this day: keep year, text, first article
const otd = B.slimOnThisDay({ events: [{ year: 1881, text: "Gunfight at the O.K. Corral.", pages: [{ titles: { normalized: "Gunfight at the O.K. Corral" }, content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Gunfight_at_the_O.K._Corral" } } }] }, { text: "" }], holidays: [{ text: "Flag Day", pages: [] }] }, "events");
ok(otd.length === 1 && otd[0].y === 1881 && otd[0].a === "Gunfight at the O.K. Corral" && otd[0].u.startsWith("https://en.wikipedia.org/"), "on this day slim");
ok(B.slimOnThisDay({ holidays: [{ text: "Flag Day", pages: [] }] }, "holidays")[0].y === null && B.slimOnThisDay({}, "deaths").length === 0, "holidays have no year");
console.log("birthday tests: " + n + " checks passed");
