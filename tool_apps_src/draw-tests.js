/* Tests for tool_apps_src/draw/lib.js (MES Draw). Run: node tool_apps_src/draw-tests.js */
"use strict";
var D = require("./draw/lib.js"), n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL:", msg); } }
function near(a, b, e, msg) { ok(Math.abs(a - b) <= (e || 1e-9), msg + " (" + a + " vs " + b + ")"); }
/* a path string must be commands + finite numbers only */
function validD(d) { if (!d || typeof d !== "string") return false; var toks = d.trim().split(/[\s,]+/); for (var i = 0; i < toks.length; i++) { var t = toks[i]; if (/^[MLHVCQAZmlhvcqaz]$/.test(t)) continue; if (!isFinite(parseFloat(t)) || /NaN|Infinity/.test(t)) return false; } return /^M/.test(d.trim()); }

/* matrices */
var m = D.mul(D.rotateAt(0.7, 10, 20), D.scaleAt(2, 3, 5, 5)), mi = D.inv(m), p = D.ap(m, 3, 4), q = D.ap(mi, p[0], p[1]);
near(q[0], 3, 1e-9, "inverse x"); near(q[1], 4, 1e-9, "inverse y");
var r = D.ap(D.rotateAt(Math.PI / 2, 0, 0), 1, 0); near(r[0], 0, 1e-12, "rotate 90 x"); near(r[1], 1, 1e-12, "rotate 90 y");
var mx = D.ap(D.mirrorX(100), 30, 7); near(mx[0], 170, 0, "mirrorX"); near(mx[1], 7, 0, "mirrorX keeps y");
var sc = D.ap(D.scaleAt(2, 2, 50, 50), 50, 50); near(sc[0], 50, 0, "scale keeps the anchor");
ok(D.isId(D.I) && !D.isId(D.tr(1, 0)), "isId");
near(D.mScale(D.scaleAt(3, 3, 0, 0)), 3, 1e-12, "mScale");

/* every shape, normal and flipped boxes */
D.SHAPES.forEach(function (s) {
	ok(validD(D.shapeD(s[0], 10, 20, 200, 120, 4)), "shape d " + s[0]);
	ok(validD(D.shapeD(s[0], 210, 140, -200, -120, 4)), "flipped shape d " + s[0]);
	ok(validD(D.shapeD(s[0], 0, 0, 0, 0, 4)), "zero-size shape d " + s[0]);
});
ok(D.shapeD("arrow", 0, 0, 100, 0, 4).split("M").length === 3, "arrow has a head");
ok(D.shapeD("arrow2", 0, 0, 100, 0, 4).split("M").length === 4, "double arrow has two heads");

/* brushes */
var pts = []; for (var i = 0; i < 40; i++) pts.push(i * 5, Math.sin(i / 4) * 30, 0.5);
["pen", "calli", "marker", "pencil", "hl", "neon", "spray", "erase"].forEach(function (b) { ok(validD(D.pathD({ t: "path", brush: b, pts: pts, w: 8, sd: 7 })), "path d " + b); });
ok(validD(D.pathD({ t: "path", brush: "pen", pts: [5, 5, 0.5], w: 8 })), "one-point pen = a dot");
ok(validD(D.pathD({ t: "path", brush: "marker", pts: [5, 5, 0.5], w: 8 })), "one-point marker");
ok(D.sprayD(pts, 10, 3) === D.sprayD(pts, 10, 3), "spray is the same every time for the same seed");
ok(D.sprayD(pts, 10, 3) !== D.sprayD(pts, 10, 4), "spray changes with the seed");
var pr = []; for (i = 0; i < 20; i++) pr.push(i * 4, 0, i / 19);
ok(validD(D.outlineD(pr, 10, "pen")), "pressure outline");
var sm = D.smoothPts(pts, 2); ok(sm.length === pts.length && sm[0] === pts[0] && sm[sm.length - 3] === pts[pts.length - 3], "smoothing keeps ends and length");
var th = D.thinPts([0, 0, .5, 0.1, 0, .5, 0.2, 0, .5, 10, 0, .5], 1); ok(th.length === 6, "thinning drops close points (" + th.length + ")");

/* boxes and hits */
var sh = D.S("rect", 10, 10, 100, 50, { sw: 4 }); var b = D.localBox(sh); near(b.x, 8, 1e-9, "rect box with half stroke"); near(b.w, 104, 1e-9, "rect box width");
var shr = D.S("rect", 0, 0, 100, 100, { sw: 0, m: D.rotateAt(Math.PI / 4, 50, 50) }); var wb = D.worldBox(shr); near(wb.w, 100 * Math.SQRT2, 1e-6, "rotated world box");
var u = D.unionBox([D.S("rect", 0, 0, 10, 10, { sw: 0 }), D.S("rect", 50, 60, 10, 10, { sw: 0 })]); near(u.w, 60, 0, "union w"); near(u.h, 70, 0, "union h");
ok(D.unionBox([]) === null, "union of nothing");
near(D.distSeg(5, 5, 0, 0, 10, 0), 5, 1e-12, "distSeg"); near(D.distPolyline([0, 0, .5, 10, 0, .5, 10, 10, .5], 12, 5), 2, 1e-12, "distPolyline");
ok(D.boxesTouch({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }) && !D.boxesTouch({ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }), "boxesTouch");
ok(D.boxInside({ x: 1, y: 1, w: 2, h: 2 }, { x: 0, y: 0, w: 10, h: 10 }), "boxInside");
var tb = D.localBox(D.T("Hello", 100, 50, 40, { al: "c" })); ok(tb.x < 100 && tb.x + tb.w > 100, "centred text box straddles x");

/* papers */
D.PAPERS.forEach(function (pp) { var layers = D.paper(pp[0], 800, 600); ok(Array.isArray(layers), "paper " + pp[0]); layers.forEach(function (l) { ok(validD(l.d), "paper d " + pp[0]); }); });

/* templates: every object known, numbers finite, SVG well formed */
var kinds = {}; D.SHAPES.forEach(function (s) { kinds[s[0]] = 1; });
var ids = {};
D.TEMPLATES.forEach(function (t) {
	ok(!ids[t.id], "unique template id " + t.id); ids[t.id] = 1;
	var d = t.make(); ok(d.w > 0 && d.h > 0 && d.bg, "template doc " + t.id);
	d.objs.forEach(function (o, k) {
		var where = t.id + " #" + k;
		ok(["path", "shape", "text", "img"].indexOf(o.t) >= 0, "type " + where);
		ok(o.m && o.m.length === 6 && o.m.every(isFinite), "matrix " + where);
		if (o.t === "shape") { ok(kinds[o.k], "kind " + o.k + " " + where); ok([o.x, o.y, o.w, o.h].every(isFinite), "numbers " + where); }
		if (o.t === "path") ok(o.pts.every(isFinite) && o.pts.length % 3 === 0, "pts " + where);
		if (o.t === "text") ok(o.size > 0 && typeof o.s === "string", "text " + where);
		ok(D.cleanObj(o) !== null, "cleanObj keeps " + where);
	});
	var svg = D.toSVG(d); ok(/^<svg /.test(svg) && /<\/svg>$/.test(svg), "svg " + t.id);
	ok((svg.match(/<g[\s>]/g) || []).length === (svg.match(/<\/g>/g) || []).length, "svg balanced groups " + t.id);
	ok(!/NaN|undefined/.test(svg), "svg has no NaN / undefined " + t.id);
	ok(D.template(t.id) !== null, "template() finds " + t.id);
});
ok(D.TEMPLATES.length >= 30, "at least 30 templates (" + D.TEMPLATES.length + ")");

/* eraser becomes a mask, and the background stays outside it */
var ed = { w: 100, h: 100, bg: { c: "#ffffff", p: "grid" }, objs: [D.S("rect", 0, 0, 50, 50), { t: "path", brush: "erase", pts: [0, 0, .5, 50, 50, .5], w: 10, c: "#000", m: D.I.slice() }, D.S("ellipse", 10, 10, 20, 20)] };
var es = D.toSVG(ed); ok(/<mask id="mesm1"/.test(es) && /mask="url\(#mesm1\)"/.test(es), "eraser makes a mask");
ok(es.indexOf('mask="url(#mesm1)"') > es.indexOf('fill="#ffffff"'), "background is outside the mask");
ok(es.lastIndexOf("<path") > es.indexOf("</g>"), "objects after the eraser are not erased");
ok(!/<rect width="100" height="100" fill="#ffffff"\/>/.test(D.toSVG(ed, { bg: false })), "bg:false leaves out the background");
ok(/&lt;b&gt;/.test(D.toSVG({ w: 10, h: 10, bg: { c: null }, objs: [D.T("<b>", 0, 0, 10)] })), "text is escaped");

/* emoji / symbols */
var all = D.search(D.EMOJI, ""); ok(all.length > 400, "lots of emoji (" + all.length + ")");
ok(D.search(D.EMOJI, "pizza").some(function (e) { return e.ch === "🍕"; }), "search finds pizza");
ok(D.search(D.SYMBOLS, "pi").some(function (e) { return e.ch === "π"; }), "search finds pi");
ok(D.search(D.EMOJI, "zzzznotthere").length === 0, "no match");
Object.keys(D.EMOJI).concat(Object.keys(D.SYMBOLS)).forEach(function (g) { var grp = D.EMOJI[g] || D.SYMBOLS[g]; D.splitList(grp).forEach(function (e) { ok(e.ch && e.ch.length <= 12 && e.words.length > 0, "entry " + g + " " + e.ch); }); });

/* file round trip, junk refused */
var dd = D.template("house"); dd.name = "My house"; dd.objs.push({ t: "img", src: "javascript:alert(1)", x: 0, y: 0, w: 1, h: 1, m: D.I.slice() });
dd.objs.push({ t: "shape", k: "rect", x: 0, y: 0, w: 1, h: 1, m: [1, 0, 0, 1, NaN, 0], _cache: 1 });
var back = D.parse(D.serialize(dd)); ok(back && back.name === "My house", "round trip name");
ok(back.objs.length === dd.objs.length - 1, "bad image link dropped");
ok(back.objs[back.objs.length - 1].m.every(isFinite) && !("_cache" in back.objs[back.objs.length - 1]), "bad matrix reset, private fields dropped");
ok(D.parse("{}") === null && D.parse("not json") === null && D.parse('{"app":"mes-draw","w":"x","h":1}') === null, "junk refused");
ok(D.parse('{"app":"mes-draw","v":1,"w":99999,"h":5}').w === 8000 && D.parse('{"app":"mes-draw","v":1,"w":99999,"h":5}').h === 16, "size clamped");

console.log((bad ? bad + " FAILED of " : "all ") + n + " checks" + (bad ? "" : " passed"));
process.exit(bad ? 1 : 0);
