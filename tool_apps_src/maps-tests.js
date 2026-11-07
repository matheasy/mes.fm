// node tool_apps_src/maps-tests.js
const M = require("./maps/lib.js");
const fs = require("fs"), path = require("path");
let n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL", msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + " (" + a + " vs " + b + ")"); }

// distances (great circle, mean radius 6371.0088 km)
near(M.dist([-0.1278, 51.5074], [-74.006, 40.7128]), 5570, 10, "London-New York");
near(M.dist([0, 0], [180, 0]), Math.PI * M.R, 0.01, "half the equator");
near(M.dist([0, 90], [0, -90]), Math.PI * M.R, 0.01, "pole to pole");
near(M.bearing([0, 0], [0, 10]), 0, 1e-9, "due north");
near(M.bearing([0, 0], [10, 0]), 90, 1e-9, "due east");
near(M.bearing([-0.1278, 51.5074], [-74.006, 40.7128]), 288.3, 0.5, "London-NY initial bearing");
// rhumb: along the equator equals the great circle; London-NY rhumb longer than great circle
near(M.rhumb([0, 0], [90, 0]).km, M.dist([0, 0], [90, 0]), 0.01, "rhumb on equator");
near(M.rhumb([0, 0], [90, 0]).bearing, 90, 1e-9, "rhumb bearing east");
ok(M.rhumb([-0.1278, 51.5074], [-74.006, 40.7128]).km > M.dist([-0.1278, 51.5074], [-74.006, 40.7128]), "rhumb longer");
near(M.rhumb([0, 0], [0, 45]).km, M.dist([0, 0], [0, 45]), 0.01, "rhumb on a meridian");
const rp = M.rhumbPoints([10, 10], [170, 60], 50);
near(rp[50][0], 170, 1e-9, "rhumb end lon"); near(rp[50][1], 60, 1e-6, "rhumb end lat");
// antimeridian: short way round
near(M.rhumb([170, 0], [-170, 0]).km, M.dist([170, 0], [-170, 0]), 0.01, "rhumb across 180");
ok(M.compass(0) === "N" && M.compass(359) === "N" && M.compass(225) === "SW", "compass");
near(M.mercArea(60), 4, 1e-9, "Mercator 4x at 60");

// mover: carries from->to, keeps distances
const f = M.mover([-42, 72], [20, 0]);
const t = f([-42, 72]);
near(t[0], 20, 1e-9, "mover lon"); near(t[1], 0, 1e-9, "mover lat");
const p1 = [-50, 70], p2 = [-30, 75];
near(M.dist(f(p1), f(p2)), M.dist(p1, p2), 1e-6, "mover keeps distance");
near(M.dist(f(p1), t), M.dist(p1, [-42, 72]), 1e-6, "mover keeps distance to centre");
const g = M.mapCoords({type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]}, M.mover([0.5, 0.5], [0.5, 60.5]));
ok(g.coordinates[0].length === 4 && g.coordinates[0][0][1] > 59, "mapCoords");

// sun: equinox noon at Greenwich, solstice declination
let s = M.subsolar(new Date(Date.UTC(2026, 2, 20, 12, 0)));
near(s[1], 0, 0.6, "equinox declination"); near(s[0], 0, 3, "noon at Greenwich (equation of time)");
s = M.subsolar(new Date(Date.UTC(2026, 5, 21, 12, 0)));
near(s[1], 23.44, 0.1, "June solstice");
s = M.subsolar(new Date(Date.UTC(2026, 11, 21, 0, 0)));
near(s[1], -23.44, 0.1, "December solstice"); near(Math.abs(s[0]), 180, 3, "midnight UTC -> sun at 180");
ok(M.isDay([0, 0], new Date(Date.UTC(2026, 2, 20, 12))) && !M.isDay([180, 0], new Date(Date.UTC(2026, 2, 20, 12))), "isDay");

// helpers
ok(M.flag("CA") === "\u{1F1E8}\u{1F1E6}", "flag"); ok(M.flag("-99") === "", "bad flag");
ok(M.fmtBig(1.4e9) === "1.40 billion", "fmtBig"); ok(M.fmtKm(1609.344, "mi") === "1,000 mi", "fmtKm");
ok(M.matches("new zea", ["New Zealand"]) && !M.matches("zea new x", ["New Zealand"]), "matches");
ok(M.matches("cote", ["Côte d'Ivoire"]), "accents");
const dec = M.decodeRings([[[100, 200, 50, 0, 0, 50, -150, -250]]]);
ok(dec[0][0][0][0] === 1 && dec[0][0][0][1] === 2 && dec[0][0].length === 5, "decode closes ring");
const r = M.rng(7), pool = ["a", "b", "c", "d", "e", "f"];
const ch = M.choices("c", pool, 4, r, x => x < "d");
ok(ch.length === 4 && ch.indexOf("c") >= 0 && new Set(ch).size === 4, "choices");
ok(M.PROJ.every(p => p.id && p.n && M.FAM[p.fam] && M.KEEPS[p.keeps]), "catalogue complete");
ok(new Set(M.PROJ.map(p => p.id)).size === M.PROJ.length, "unique ids");

// data files
const dir = path.join(__dirname, "..", "mes.fm", "maps", "data");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "countries.json")));
const wa = JSON.parse(fs.readFileSync(path.join(dir, "countries-50m.json")));
const ids = wa.objects.countries.geometries.map(g => g.id || ("x" + M.norm(g.properties.name).replace(/ /g, "")));
ok(ids.every(id => meta[id]), "every shape has metadata");
ok(meta["124"].cap[0] === "Ottawa" && meta["840"].cap[0] === "Washington, D.C." && meta["036"].cap[0] === "Canberra", "capitals");
const sovereign = Object.values(meta).filter(m => m.cap).length;
ok(sovereign >= 195, "capitals for >=195 places (" + sovereign + ")");
const a1 = JSON.parse(fs.readFileSync(path.join(dir, "admin1.json")));
ok(a1.f.length > 280 && a1.f.filter(x => x.cap).length >= a1.f.length - 2, "admin-1 capitals");
const bc = a1.f.find(x => x.n === "British Columbia");
ok(bc && bc.cap && bc.cap[0] === "Victoria", "BC capital");
const tx = a1.f.find(x => x.n === "Texas");
ok(tx && tx.cap[0] === "Austin", "Texas capital");

console.log(bad ? bad + " of " + n + " FAILED" : "all " + n + " checks pass");
process.exit(bad ? 1 : 0);
