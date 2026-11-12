/* MES Photo Editor round 12b (2026-11-12): a layer style on a text layer follows the letters, not the text's own Outline / Shadow / Box.
 * Serve mes.fm on 127.0.0.1:8445, then NODE_PATH=<folder>/node_modules node tool_apps_src/photo-editor/text-style-round12-playwright.js brave|chromium|chrome|firefox */
const pw = require("playwright");
const BR = process.argv[2] || "brave", BASE = process.argv[3] || "http://127.0.0.1:8445", BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const FAIL = []; const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) FAIL.push(m); };
const launch = () => BR === "brave" ? pw.chromium.launch({ executablePath: BRAVE }) : BR === "chrome" ? pw.chromium.launch({ channel: "chrome" }) : pw[BR].launch();
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }), pg = await ctx.newPage(); console.log("Browser:", BR, b.version());
  await pg.route(/googlesyndication|doubleclick|fastcomments|googletagmanager/, r => r.abort()); pg.on("pageerror", e => { console.log("  PAGEERR", e.message); FAIL.push(e.message); });
  await pg.goto(BASE + "/photo/?t=" + Date.now()); await pg.waitForFunction(() => window.PE && PE.newDoc && PE.renderText);
  const run = (extra) => pg.evaluate(async (extra) => {
    PE.newDoc(700, 260, "#808080", "t"); await new Promise(r => setTimeout(r, 120));
    const o = Object.assign(JSON.parse(JSON.stringify(PE.TEXTDEF)), { str: "OIO", font: "Arial, sans-serif", size: 140, bold: true, color: "#ffffff", strokeOn: true, stroke: "#000000", strokeW: 10 }, extra.text || {});
    const L = PE.makeLayer({ type: "text", name: "T", text: o, w: 4, h: 4 }); PE.renderText(L); L.cx = 350; L.cy = 130; PE.addLayer(L); PE.setActive(L.id);
    L.fx = Object.assign({ color: { on: true, c: "#ff0000", op: 1, mode: "source-over" }, outline: { on: true, w: 5, c: "#00ff00", pos: "outside", op: 1, mode: "source-over" } }, extra.fx || {}); PE.commit("t");
    if (extra.reopen) { const bl = await PE.projectBlob(); await PE.loadProject(await bl.arrayBuffer(), "x.mesproj"); }
    if (extra.undo) { const T = PE.doc.layers.find(l => l.type === "text"); T.text.str = "OIOI"; PE.renderText(T); PE.commit("edit"); PE.undo(); }
    const c = PE.flatten(), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let red = 0, black = 0, green = 0, white = 0;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], bb = d[i + 2]; if (r > 200 && g < 60 && bb < 60) red++; else if (r < 40 && g < 40 && bb < 40) black++; else if (g > 200 && r < 80 && bb < 80) green++; else if (r > 230 && g > 230 && bb > 230) white++; }
    return { red, black, green, white };
  }, extra);
  console.log("letters only (default)");
  let m = await run({}); ok(m.red > 2000 && m.black > 2000, `overlay colours the letters red and leaves the black outline (red ${m.red}, black ${m.black})`);
  ok(m.green < 50, `layer-style stroke goes round the letters, under the text's outline, not around the outline (green ${m.green})`);
  console.log("letters and outline (switch off)");
  let m2 = await run({ fx: { tall: true } }); ok(m2.black < 50 && m2.green > 1000, `old behaviour on request: whole text red, stroke round the outline (black ${m2.black}, green ${m2.green})`);
  console.log("no text outline: unchanged");
  let m3 = await run({ text: { strokeOn: false } }); ok(m3.red > 2000 && m3.green > 1000 && m3.white < 50, `plain text: overlay + stroke as before (red ${m3.red}, green ${m3.green})`);
  console.log("after reopening and after undo");
  let m4 = await run({ reopen: true }); ok(m4.black > 2000 && m4.green < 50, `reopened project keeps letters-only (black ${m4.black}, green ${m4.green})`);
  let m5 = await run({ undo: true }); ok(m5.black > 2000 && m5.green < 50, `after undo too (black ${m5.black}, green ${m5.green})`);
  console.log("dialog switch");
  const has = await pg.evaluate(async () => { PE.dlgLayerStyle(PE.active(), "blend"); await new Promise(r => setTimeout(r, 200)); const t = [...document.querySelectorAll(".pe-dlg label, .pe-dlg .pe-row")].map(e => e.textContent).join(" | "); const box = [...document.querySelectorAll(".pe-dlg input[type=checkbox]")].find(i => /letters only/i.test(i.closest(".pe-row") ? i.closest(".pe-row").textContent : "")); return { found: /letters only/i.test(t), checked: box ? box.checked : null }; });
  ok(has.found && has.checked === true, "Blending options shows the switch, ticked by default");
  await b.close(); console.log(FAIL.length ? "\n" + FAIL.length + " FAILED" : "\nall passed");
})();
