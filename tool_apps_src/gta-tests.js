/* node tool_apps_src/gta-tests.js -- MES GTA 6 Hub maths (tool_apps_src/gta/lib.js). */
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
global.CK = require("./clock/lib.js"); /* the page gets the clock lib through lib_from; with it, B.C. is on permanent UTC-7 even on old tz data */
const M = require("./gta/lib.js");
let n = 0; function ok(c, m) { assert.ok(c, m); n++; } function near(a, b, tol, m) { assert.ok(Math.abs(a - b) <= tol, m + ": " + a + " vs " + b); n++; }

/* 1. the api copy is byte-identical */
ok(fs.readFileSync(path.join(__dirname, "gta/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_gta-lib.js"), "utf8"), "mes.fm/api/_gta-lib.js must equal tool_apps_src/gta/lib.js (cp it)");

/* 2. projectile formulas */
const g = 9.80665;
let p = M.projectile(20, 45, 0, g); near(p.x, 400 / g, 1e-9, "range at 45 deg on the level"); near(p.apex, 100 / g, 1e-9, "apex"); near(p.t, 2 * 20 * Math.SQRT1_2 / g, 1e-9, "airtime");
near(p.angLand, -45, 1e-9, "lands at -45 deg");
for (const [x, th, h] of [[20, 10, 0], [30, 15, 3], [12, 0, 14], [45, 20, -2]]) { const v = M.speedNeeded(x, th, h, g), q = M.projectile(v, th, h, g); near(q.x, x, 1e-6, "speedNeeded lands exactly on the gap " + [x, th, h]); }
ok(M.speedNeeded(30, 10, -10, g) === Infinity, "impossible jump gives Infinity");
for (const [v, h] of [[20, 0], [25, 10], [15, 30]]) { const best = M.bestAngle(v, h, g); let mx = 0, at = 0; for (let a = 0; a <= 80; a += 0.05) { const q = M.projectile(v, a, h, g); if (q && q.x > mx) { mx = q.x; at = a; } } near(best, at, 0.06, "best angle " + v + "," + h); }
near(M.bestAngle(30, 0, g), 45, 1e-9, "45 deg on the level");
/* drag: tends to no-drag as k -> 0, and is always shorter */
let d0 = M.dragFlight(25, 20, 2, 0, g), q0 = M.projectile(25, 20, 2, g); near(d0.x, q0.x, 0.01, "dragFlight with k=0 equals the formula"); near(d0.t, q0.t, 0.003, "airtime k=0");
let d1 = M.dragFlight(25, 20, 2, 0.5 * 1.2 * 0.65 / 1400, g); ok(d1.x < q0.x && d1.x > q0.x * 0.95, "car drag shortens a 90 km/h jump by a few percent");
near(M.dragFlight(M.speedNeededDrag(30, 15, 1, 0.0003, g), 15, 1, 0.0003, g).x, 30, 0.01, "speedNeededDrag reaches the gap");

/* 3. course geometry */
let co = M.buildCourse({ ramp: "straight", angle: 10, height: 4, gap: 15, pit: 0, land: "ramp", landAngle: 10, landHeight: 4 });
near(M.groundAt(co, 0).y, 4, 1e-9, "lip at its height"); near(M.groundAt(co, 15.001).y, 4, 0.01, "landing deck at its height"); near(M.groundAt(co, 7).y, 0, 1e-9, "flat ground in the gap");
near(co.lip.angle * 180 / Math.PI, 10, 1e-9, "lip angle"); near(M.groundAt(co, -0.01).slope * 180 / Math.PI, 10, 0.01, "straight part at the ramp angle");
ok(co.pts.every((pt, i) => i === 0 || pt[0] >= co.pts[i - 1][0]), "x never decreases");
let hit = M.rayHit(co, -100, 5, 0, -1, 10); near(hit.t, 5, 1e-9, "ray hits the road");
let cu = M.buildCourse({ ramp: "curved", angle: 30, height: 3, gap: 10, land: "flat" }); near(M.groundAt(cu, -0.001).slope * 180 / Math.PI, 30, 0.6, "curved kicker ends at its angle");
let rf = M.buildCourse({ ramp: "none", gap: 8, pit: 14, land: "platform", landHeight: -2, plat: 25 }); near(M.groundAt(rf, 4).y, -14, 1e-9, "street below the roofs"); near(M.groundAt(rf, 10).y, -2, 1e-9, "lower roof");

/* 4. the vehicle: settles level at 1 g, every vehicle */
const flat = M.buildCourse({ ramp: "none", gap: 0, pit: 0, land: "flat" });
for (const v of M.VEHICLES) {
	const s = new M.Sim(flat, v, { mode: "drive", approach: 50 }); for (let i = 0; i < 1500; i++) s.step(1 / 500);
	near(s.y, v.hcg, 0.004, v.id + " ride height"); near(s.th, 0, 1e-3, v.id + " level"); near(s.gNow, 1, 0.02, v.id + " 1 g at rest"); near(s.vx, 0, 0.01, v.id + " stays put");
}
/* full throttle reaches a sensible speed; drag + power give a top speed */
{ const s = new M.Sim(flat, M.vehicle("sports"), { mode: "drive", approach: 50 }); s.input.gas = 1; for (let i = 0; i < 500 * 6; i++) s.step(1 / 500); const kmh = s.vx * 3.6; ok(kmh > 85 && kmh < 160, "sports coupe after 6 s of full throttle: " + kmh.toFixed(0) + " km/h"); }
/* cruise control holds the set speed to the lip */
{ const s = new M.Sim(co, M.vehicle("super"), { mode: "auto", kmh: 78 }); while (s.state === "approach" && s.t < 20) s.step(1 / 500); near(s.ev.takeoff.v * 3.6, 78, 4, "takes off at about the set speed"); }
/* free flight conserves the angular velocity (no torque) and follows the parabola */
{ const s = new M.Sim(co, M.vehicle("super"), { mode: "auto", kmh: 78 }); while (s.state !== "air") s.step(1 / 500); for (let i = 0; i < 20; i++) s.step(1 / 500); const w0 = s.w, vy0 = s.vy, vx0 = s.vx; for (let i = 0; i < 100; i++) s.step(1 / 500);
	near(s.w, w0, 1e-9, "angular velocity constant in the air"); near((s.vy - vy0) / 0.2, -g, 0.6, "falls at g (minus a little drag)"); ok(s.vx < vx0, "drag slows it"); near(s.gNow, 0, 0.05, "weightless in the air"); }
/* gas in the air lifts the nose, brake drops it (wheel angular momentum) */
{ function rot(inp) { const s = new M.Sim(co, M.vehicle("dirt"), { mode: "auto", kmh: 65 }); while (s.state !== "air") s.step(1 / 500); const w0 = s.w; s.input.gas = inp === "gas" ? 1 : 0; s.input.brake = inp === "brake" ? 1 : 0; for (let i = 0; i < 100; i++) s.step(1 / 500); return s.w - w0; }
	ok(rot("gas") > 0.02, "gas in the air turns the nose up"); ok(rot("brake") < -0.02, "brake in the air turns the nose down"); }

/* 5. presets land as tuned */
const expect = { kicker: ["hard"], pro: ["clean"], canal: ["clean", "hard"], roof: ["hard"], canyon: ["clean", "hard"], mega: ["clean", "hard"], monster: ["clean", "hard"], whoop: ["clean"], curved: ["crash"] };
for (const pr of M.PRESETS) { const r = M.simulate(M.buildCourse(pr.c), M.vehicle(pr.veh), { mode: "auto", kmh: pr.kmh }); ok(expect[pr.id].indexOf(r.code) >= 0, pr.id + " lands " + expect[pr.id] + " (got " + r.code + ": " + r.title + ")"); }
/* the pro ramp: too slow is short, the window is clean, too fast is harder */
{ const c = M.buildCourse(M.PRESETS[1].c), v = M.vehicle("super"); const a = M.sweepOne(c, v, {}, 60), b = M.sweepOne(c, v, {}, 78), z = M.sweepOne(c, v, {}, 95);
	ok(a.code === "short", "60 km/h comes up short"); ok(b.code === "clean", "78 km/h clean"); ok(z.landG > b.landG, "faster lands harder"); ok(z.dist > b.dist && b.dist > a.dist, "faster flies further"); }
/* water: splash */
{ const c = M.buildCourse(M.PRESETS[2].c); ok(M.sweepOne(c, M.vehicle("muscle"), {}, 50).code === "splash", "too slow over the canal splashes"); }
/* the Moon: same jump flies much further */
{ const c = M.buildCourse(M.PRESETS[0].c), e = M.simulate(c, M.vehicle("hatch"), { mode: "auto", kmh: 45 }), m = M.simulate(c, M.vehicle("hatch"), { mode: "auto", kmh: 45, g: 1.62, rho: 0 }); ok(m.dist > e.dist * 2.5, "Moon jump goes further: " + e.dist.toFixed(1) + " vs " + m.dist.toFixed(1)); }

/* 6. countdown */
near(M.midnight("Pacific/Auckland", "2026-11-19"), Date.UTC(2026, 10, 18, 11, 0), 0, "Auckland midnight = 11:00 UTC the day before (NZDT +13)");
near(M.midnight("America/New_York", "2026-11-19"), Date.UTC(2026, 10, 19, 5, 0), 0, "New York EST");
near(M.midnight("Europe/London", "2026-11-19"), Date.UTC(2026, 10, 19, 0, 0), 0, "London GMT");
near(M.midnight("Asia/Kolkata", "2026-11-19"), Date.UTC(2026, 10, 18, 18, 30), 0, "India +5:30");
near(M.midnight("America/Vancouver", "2026-11-19"), Date.UTC(2026, 10, 19, 7, 0), 0, "Vancouver on permanent UTC-7 (B.C. stopped changing clocks in Nov 2026)");
near(M.midnight("Pacific/Honolulu", "2026-11-19") - M.midnight("Pacific/Auckland", "2026-11-19"), 23 * 3600e3, 0, "Hawaii unlocks 23 h after New Zealand");
let pt = M.parts(90061000); ok(pt.d === 1 && pt.h === 1 && pt.m === 1 && pt.s === 1, "parts"); ok(M.parts(-5).total === 0, "never negative");
ok(M.CITIES.every((c) => { try { M.midnight(c[1], "2026-11-19"); return true; } catch (e) { return false; } }), "every city zone works");

/* 7. download maths */
near(M.downloadSeconds(212, 100, "mbps", 1), 212 * 8e9 / 100e6, 1e-6, "212 GB at 100 Mbps"); near(M.downloadSeconds(212, 12.5, "mbs", 1), M.downloadSeconds(212, 100, "mbps", 1), 1e-6, "12.5 MB/s = 100 Mbps");
near(M.downloadSeconds(212, 1, "gbps", 0.5), 3392, 1e-6, "1 Gbps at half efficiency"); ok(M.downloadSeconds(212, 0, "mbps") === Infinity, "zero speed");
ok(M.durationText(16960) === "4 hours 43 minutes", "duration text: " + M.durationText(16960)); ok(M.durationText(45) === "45 seconds", "short"); ok(/^2 days/.test(M.durationText(2 * 86400 + 3600)), "days");
ok(M.CONSOLES.every((c) => c.usable < c.total), "usable < advertised");

/* 8. news parsing */
const rss = '<rss><channel><item><title>GTA 6 &amp; the PS5 &#8211; new trailer</title><link>https://example.com/a</link><pubDate>Sat, 07 Nov 2026 10:00:00 GMT</pubDate></item>' +
	'<item><title><![CDATA[Rockstar Games confirms preload]]></title><link>https://example.com/b</link><pubDate>Sat, 07 Nov 2026 12:00:00 GMT</pubDate></item>' +
	'<item><title>A javascript link</title><link>javascript:alert(1)</link></item><item><title>Some other game</title><link>https://example.com/c</link></item></channel></rss>';
const items = M.parseRss(rss, 10); ok(items.length === 3, "javascript: links dropped"); ok(items[0].title === "Rockstar Games confirms preload", "newest first, CDATA");
ok(items[1].title === "GTA 6 & the PS5 – new trailer", "entities decoded: " + items[1].title);
ok(items.filter((x) => M.aboutGta(x.title)).length === 2, "only GTA / Rockstar items kept"); ok(!M.aboutGta("Agatha Christie review"), "no false 'gta' inside words");
ok(M.parseRss('<item><title>X - Source</title><link>https://a.b/c</link><source url="x">Source</source></item>')[0].title === "X", "source suffix removed");

console.log("gta-tests: " + n + " checks passed");
