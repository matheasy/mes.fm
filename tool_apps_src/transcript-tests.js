// node tool_apps_src/transcript-tests.js  (MES Transcript & Timestamps: lib.js + the API's XML parser)
const assert = require("assert");
const X = require("./transcript/lib.js"), T = require("../mes.fm/api/yt-transcript.js")._t;
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
ok(X.fmt(0) === "0:00" && X.fmt(65) === "1:05" && X.fmt(3725) === "1:02:05" && X.fmt(65, true) === "0:01:05", "fmt");
ok(X.parseTime("1:02:05") === 3725 && X.parseTime("62:05") === 3725 && X.parseTime("00:00:01,500") === 1.5 && X.parseTime("1h2m5s") === 3725 && isNaN(X.parseTime("abc")), "parseTime");
ok(X.stamp(3725.5) === "01:02:05,500" && X.stamp(1.25, ".") === "00:00:01.250", "stamp");
const cues = X.norm([[2, 5, "b"], [0, 4, "a "], [5, 0, "c"], [9, 1, ""]]);
ok(cues.length === 3 && cues[0][2] === "a" && cues[0][1] === 2 && cues[1][1] === 3 && cues[2][1] === 3, "norm trims overlaps");
// XML from YouTube (double-encoded)
const xml = '<?xml version="1.0"?><transcript><text start="1" dur="4.4">It&amp;#39;s time</text><text start="2.6" dur="6">for &lt;math&gt;</text></transcript>';
const p = T.parseXml(xml); ok(p.length === 2 && p[0][2] === "It's time" && p[1][2] === "for <math>", "parseXml");
ok(T.parseXml('<timedtext><body><p t="1000" d="2000">hi <s>there</s></p></body></timedtext>')[0].join() === "1,2,hi there", "srv3");
// pasted text
const srt = "1\n00:00:01,000 --> 00:00:03,000\nHello there\n\n2\n00:00:03,500 --> 00:00:05,000\nSecond <i>line</i>\n";
let r = X.parseText(srt); ok(r.kind === "srt" && r.cues.length === 2 && r.cues[1][2] === "Second line" && r.cues[0][0] === 1, "srt");
r = X.parseText("WEBVTT\n\n00:01.000 --> 00:02.000\nhello\n\n00:02.000 --> 00:03.000\nhello world\n"); ok(r.kind === "vtt" && r.cues.map(c => c[2]).join("|") === "hello|world", "vtt rolling");
r = X.parseText("0:01\nAll right, it's time\n1 second\n0:04\nToday I'm going\n1:02:03\nlater"); ok(r.kind === "stamps" && r.cues.length === 3 && r.cues[2][0] === 3723 && r.cues[0][2] === "All right, it's time", "youtube panel");
r = X.parseText("[0:05] one\n[0:10] two"); ok(r.cues.length === 2 && r.cues[1][0] === 10, "bracket stamps");
r = X.parseText('[{"timestamp":[0,2],"text":"x"},{"timestamp":[2,4],"text":"y"}]'); ok(r.kind === "json" && r.cues[1][2] === "y", "json");
ok(X.parseText("just words").kind === "plain", "plain");
// export round trips
const c2 = X.norm([[0, 2, "One."], [2, 2, "Two."], [10, 2, "Three."]]);
ok(X.parseText(X.toSRT(c2)).cues.map(c => c[2]).join() === "One.,Two.,Three.", "srt round trip");
ok(X.parseText(X.toVTT(c2)).cues.length === 3, "vtt round trip");
ok(JSON.parse(X.toJSON(c2)).cues[2].end === 12, "json export");
ok(X.toTXT(c2, { stamps: true }).split("\n")[2] === "0:10 Three.", "txt stamps");
// chapters
const ch = X.descChapters("Intro text\n0:00 Intro\n1:05 Part one\n(1:02:03) - Part two\nnot 99 a line");
ok(ch.length === 3 && ch[2].t === 3723 && ch[2].title === "Part two", "descChapters");
ok(X.checkChapters(ch, 4000).length === 0 && X.checkChapters([{ t: 5, title: "a" }], 100).length >= 2, "checkChapters");
ok(X.fmtChapters(ch, { dash: true }).split("\n")[1] === "1:05 - Part one", "fmtChapters");
ok(X.parseChapters("Here you go:\n0:00 Intro\n3:53 Footage\n8:47 Left wing").length === 3, "parseChapters");
// synthetic talk: three topics -> boundaries near the topic changes
const topics = [["magnet", "field", "iron", "filings", "compass"], ["shuttle", "columbia", "wing", "tile", "foam"], ["poisson", "ratio", "strain", "stress", "modulus"]];
const syn = []; let t = 0;
topics.forEach(ws => { for (let i = 0; i < 60; i++, t += 5) syn.push([t, 4.5, "so the " + ws[i % 5] + " and the " + ws[(i + 2) % 5] + " with " + ws[(i + 3) % 5]]); });
const auto = X.chapters(X.norm(syn), { n: 3 });
ok(auto.length === 3 && auto[0].t === 0 && Math.abs(auto[1].t - 300) <= 40 && Math.abs(auto[2].t - 600) <= 40, "chapters find topic changes " + JSON.stringify(auto));
ok(/shuttle|columbia|wing|tile|foam/i.test(auto[1].title) && /poisson|ratio|strain|stress|modulus/i.test(auto[2].title), "chapter titles use the topic words");
ok(X.checkChapters(auto, X.end(syn)).length === 0, "auto chapters follow YouTube rules");
ok(/^\[0:00\]/.test(X.compact(syn, 20)) && X.prompt(syn, { title: "T" }).indexOf("0:00 Intro") > 0, "prompt");
ok(X.search(c2, "two").join() === "1" && X.search(c2, "one. two").join() === "0", "search");
ok(X.cueAt(c2, 3) === 1 && X.cueAt(c2, -1) === -1, "cueAt");
// whisper blocks
const bl = X.blocks(250, 120, 5); ok(bl.length === 3 && bl[1].s === 115 && bl[1].keepFrom === 117.5 && bl[2].keepTo === Infinity, "blocks");
ok(X.whisperCues([{ timestamp: [1, 2], text: " hi" }, { timestamp: [3, null], text: "[BLANK_AUDIO]" }], 100, 0, Infinity).join() === "101,1,hi", "whisperCues");
console.log("transcript tests: " + n + " passed");
