// node tool_apps_src/cloud-files-tests.js -- pure helpers of mes.fm/main_js/cloud-files.js (MES Cloud Files)
const H = require("../mes.fm/main_js/cloud-files.js"), assert = require("assert");
let n = 0; const t = (a, b) => { assert.deepStrictEqual(a, b); n++; };
t(H.extOf("Budget.XLSX"), "xlsx"); t(H.extOf("noext"), ""); t(H.baseName("a.b.docx"), "a.b");
t(H.accepts("x.Docx", [".docx"]), true); t(H.accepts("x.pdf", [".docx", ".xlsx"]), false);
t(H.safeName('a/b:c?"d".xlsx'), "a-b-c-d-.xlsx"); t(H.safeName("", "docx"), "Untitled.docx"); t(H.safeName("notes", ".docx"), "notes.docx");
t(H.safeName("..hidden.xlsx"), "hidden.xlsx"); t(H.safeName("x".repeat(300) + ".xlsx").length <= 200, true);
t(/^Budget \(copy \d{4}-\d\d-\d\d \d{4}\)\.xlsx$/.test(H.copyName("Budget.xlsx")), true);
t(H.fmtBytes(500), "500 B"); t(H.fmtBytes(2048), "2.0 KB"); t(H.fmtBytes(5 * 1048576), "5.0 MB");
t(H.ago(1000, 1000 + 30e3), "just now"); t(H.ago(0, 5 * 60e3), "5 min ago"); t(H.ago(0, 3 * 3600e3), "3 h ago");
const r = H.pushRecent([{ p: "dropbox", ref: "a" }, { p: "onedrive", ref: "a" }], { p: "dropbox", ref: "a", name: "new" }, 12);
t(r.length, 2); t(r[0].name, "new"); t(r[1].p, "onedrive");
t(H.pushRecent(Array.from({ length: 20 }, (_, i) => ({ p: "x", ref: "" + i })), { p: "y", ref: "z" }, 12).length, 12);
t(H.filesFor([{ name: "a.xlsx", mod: 1 }, { name: "copy-text.json", mod: 9 }, { name: "b.csv", mod: 5 }], [".xlsx", ".csv"]).map(f => f.name), ["b.csv", "a.xlsx"]);
console.log("cloud-files: " + n + " checks passed");
