/* node tool_apps_src/gnm-tests.js  -- German New Medicine explorer (lib.js = MESGNM) */
const G = require("./gnm/lib.js");
const fs = require("fs"), path = require("path");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }

/* data integrity */
ok(G.ORGANS.length >= 25, "organ catalogue has 25+ organs (" + G.ORGANS.length + ")");
const ids = new Set();
G.ORGANS.forEach(o => {
	ok(!ids.has(o.id), "unique organ id " + o.id); ids.add(o.id);
	ok(!!G.LAYERS[o.layer], o.id + " has a valid germ layer");
	ok(o.x > 0 && o.x < 220 && o.y > 0 && o.y < 440, o.id + " dot inside the body diagram");
	ok(o.conflict && o.ca && o.pcl && o.relay, o.id + " has conflict / ca / pcl / relay text");
	ok(o.kw.length > 0, o.id + " has keywords");
	Object.keys(o.cue).forEach(k => { ok(o.kw.indexOf(k) >= 0, o.id + " cue '" + k + "' is one of its keywords"); ok(!!G.PHASES[o.cue[k]], o.id + " cue phase valid"); });
	G.ORDER.forEach(p => ok(G.organText(o, p).length > 10, o.id + " has text for " + p));
});
G.LAYER_ORDER.forEach(k => ok(G.ORGANS.some(o => o.layer === k), "layer " + k + " has organs"));
ok(G.LAWS.length === 5, "five laws");
/* third law: old brain + in active phase, new brain - */
ok(G.cellSign("endo", "ca") === "+" && G.cellSign("oldm", "ca") === "+", "old brain: cells multiply in the active phase");
ok(G.cellSign("newm", "ca") === "-" && G.cellSign("ecto", "ca") === "-", "new brain: cells lost in the active phase");
ok(G.cellSign("endo", "pcla") === "-" && G.cellSign("newm", "pcla") === "+", "reverse in healing");

/* glossary covers every data-g in content.html and every q('x') in app.js */
const content = fs.readFileSync(path.join(__dirname, "gnm/content.html"), "utf8"), app = fs.readFileSync(path.join(__dirname, "gnm/app.js"), "utf8");
(content.match(/data-g="([a-z_]+)"/g) || []).forEach(m => { const k = m.slice(8, -1); ok(!!G.GLOSSARY[k], "glossary has '" + k + "' (content.html)"); });
(app.match(/\bq\("([a-z_]+)"\)/g) || []).forEach(m => { const k = m.slice(3, -2); ok(!!G.GLOSSARY[k], "glossary has '" + k + "' (app.js)"); });
Object.keys(G.PHASES).forEach(p => ok(!!G.GLOSSARY[G.PHASES[p].g], "phase " + p + " has a glossary entry"));
G.LAYER_ORDER.forEach(k => ok(!!G.GLOSSARY[k], "layer " + k + " has a glossary entry"));
["dhs", "mass", "track", "handedness", "constellation", "focus", "sbs", "syndrome", "hanging", "recurrence"].forEach(k => ok(!!G.GLOSSARY[k], "required term " + k));

/* the curve */
Object.keys(G.SCEN).forEach(sc => {
	const m = G.build({ scenario: sc, intensity: 0.7, duration: 0.5 });
	ok(m.T > 30 && m.segs.length >= 3, sc + ": built");
	let contiguous = true; for (let i = 1; i < m.segs.length; i++) if (Math.abs(m.segs[i].t0 - m.segs[i - 1].t1) > 1e-9) contiguous = false;
	ok(contiguous, sc + ": segments are contiguous");
	ok(Math.abs(m.segs[m.segs.length - 1].t1 - m.T) < 1e-9, sc + ": last segment ends at T");
	let finite = true, maxJump = 0, prev = null;
	G.sample(m, 2000).forEach(p => { if (!isFinite(p[1])) finite = false; if (prev !== null) maxJump = Math.max(maxJump, Math.abs(p[1] - prev)); prev = p[1]; });
	ok(finite, sc + ": finite levels"); ok(maxJump < 0.2, sc + ": the curve is continuous (max step " + maxJump.toFixed(3) + ")");
	m.segs.forEach(s => { const mid = (s.t0 + s.t1) / 2; ok(G.phaseAt(m, mid).p === s.p, sc + ": phaseAt mid " + s.p); });
});
{
	const m = G.build({ scenario: "classic", intensity: 0.8, duration: 0.5 });
	ok(m.segs.map(s => s.p).join(",") === "norm,dhs,ca,cl,pcla,ec,pclb,norm", "classic order normotonia -> ... -> normotonia");
	const at = p => G.levelAt(m, G.placeFor(m, p));
	ok(at("ca") > 0.5, "ca-phase is sympathicotonia (above the line)");
	ok(at("pcla") < -0.2 && at("pclb") < 0, "PCL is vagotonia (below the line)");
	const ec = m.events.find(e => e.id === "ec"); ok(G.levelAt(m, ec.t) > at("pcla"), "EC is a sympathicotonic peak inside healing");
	ok(Math.abs(G.levelAt(m, m.T)) < 0.1, "ends back at normotonia");
	const big = G.build({ scenario: "classic", intensity: 1, duration: 1 }), small = G.build({ scenario: "classic", intensity: 0.3, duration: 0.3 });
	const depth = mm => Math.min.apply(null, G.sample(mm, 800).map(p => p[1]));
	ok(depth(big) < depth(small), "bigger conflict mass -> deeper healing phase");
	const len = (mm, p) => mm.segs.filter(s => s.p === p).reduce((a, s) => a + s.t1 - s.t0, 0);
	ok(len(big, "pcla") > len(small, "pcla"), "bigger conflict mass -> longer healing phase");
}
{ const m = G.build({ scenario: "unresolved" }); ok(!m.segs.some(s => s.p === "cl" || s.p === "pcla"), "unresolved: no CL, no healing"); }
{ const m = G.build({ scenario: "hanging" }); ok(!m.segs.some(s => s.p === "ec"), "hanging healing never reaches the crisis"); ok(m.segs.filter(s => s.rec).length >= 3, "hanging: several recurrences"); }
{ const m = G.build({ scenario: "recurrence" }); ok(m.segs.filter(s => s.p === "ec").length === 2, "recurrence: two complete cycles"); }
ok(G.phaseAt(G.build({}), -5).p === "norm" && G.phaseAt(G.build({}), 1e9).p === "norm", "phaseAt clamps");

/* matcher */
function m(t) { return G.match(t); }
ok(m("cold hands, can't sleep, losing weight").phase === "ca", "ca example");
ok(m("fever, swelling, tired").phase === "pcla", "PCL-A example");
ok(m("chills, palpitations, cold sweat").phase === "ec", "EC example");
ok(m("peeing a lot, energy coming back").phase === "pclb", "PCL-B example");
ok(m("I feel so relieved, it's resolved").phase === "cl", "CL example");
ok(m("it came out of the blue, a total shock").phase === "dhs", "DHS example");
ok(m("no fever, cold feet").phase === "ca", "negation: 'no fever' left out");
ok(m("no fever, cold feet").why.some(w => w.neg && w.w === "fever"), "negation reported");
ok(m("not tired at all").phase === null, "only negated words -> no phase");
{ const r = m("cough and a runny nose"); ok(r.phase === "pcla" && r.organs.map(o => o.id).indexOf("bronchi") >= 0 && r.organs.map(o => o.id).indexOf("nose") >= 0, "cough + runny nose -> bronchi + nose, PCL"); }
{ const r = m("cold hands"); ok(r.organs.length === 0, "'cold' inside 'cold hands' is not the common cold"); }
{ const r = m("I have a cold"); ok(r.organs[0] && r.organs[0].id === "nose" && r.phase === "pcla", "a cold -> nasal mucosa healing"); }
{ const r = m("itchy rash that keeps coming back"); ok(r.organs[0].id === "skin" && r.scenario === "hanging", "chronic rash -> skin, hanging healing"); }
{ const r = m("back pain and swollen joints"); ok(r.organs.some(o => o.id === "bone") && r.organs.some(o => o.id === "joints") && r.phase === "pcla", "back pain + swollen joints -> new mesoderm healing"); }
{ const r = m("energy coming back"); ok(!r.organs.some(o => o.id === "bone"), "'coming back' is not the back"); }
{ const r = m("baby keeps pooping blood. Pediatrician says baby may have dairy allergy, so mom is not going to drink dairy"); const ids = r.organs.map(o => o.id); ok(r.phase === "pcla" && ids.indexOf("intestine") >= 0 && ids.indexOf("rectum") >= 0, "baby pooping blood -> intestine + rectum, PCL-A"); ok(r.scenario === "hanging" && ["baby", "food", "blood"].every(k => r.notes.some(n => n.id === k)), "allergy = track; baby / food / blood notes"); }
{ const r = m("blood in the diaper and spitting up"); ok(r.organs.some(o => o.id === "stomach") && r.organs.some(o => o.id === "rectum"), "diaper blood + spitting up"); }
ok(!m("my blood pressure is high").notes.some(n => n.id === "blood"), "blood pressure is not bleeding");
ok(m("no allergy").scenario === null, "negated allergy");
ok(m("").empty && m("   ").empty, "empty input");
ok(m("asdf qwerty").phase === null && m("asdf qwerty").organs.length === 0, "nothing matched");
ok(G.match("Swellings and FEVER!!").phase === "pcla", "case, punctuation and plurals");

/* wording: describes GNM, never instructs */
const all = JSON.stringify([G.PHASES, G.LAYERS, G.ORGANS, G.LAWS, G.GLOSSARY, G.CUES]) + content;
["skip treatment", "stop treatment", "stop chemo", "don't see a doctor", "do not see a doctor", "you have cancer", "diagnosis:"].forEach(w => ok(all.toLowerCase().indexOf(w) < 0, "no instruction / diagnosis wording: " + w));
ok(/in GNM|Hamer/i.test(G.ORGANS.map(o => o.ca + o.pcl + o.conflict).join(" ")) && /In GNM|Hamer/.test(JSON.stringify(G.PHASES)), "attributed to GNM / Hamer");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
