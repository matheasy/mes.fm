/* MES Photo Editor round 12c (2026-11-12): the preview windows (every adjustment / filter, Levels, Curves, Round corners) keep what they show when closed
 * with the ✕ / Esc once something was changed (one undo step); untouched they just close; Cancel puts the picture back.
 * Serve mes.fm on 127.0.0.1:8445, then NODE_PATH=<folder>/node_modules node tool_apps_src/photo-editor/filter-close-round12-playwright.js brave|chromium|chrome|firefox */
const pw = require("playwright");
const BR = process.argv[2] || "brave", BASE = process.argv[3] || "http://127.0.0.1:8445", BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const FAIL = []; const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) FAIL.push(m); };
const launch = () => BR === "brave" ? pw.chromium.launch({ executablePath: BRAVE }) : BR === "chrome" ? pw.chromium.launch({ channel: "chrome" }) : pw[BR].launch();
(async () => {
  const b = await launch(), pg = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); console.log("Browser:", BR, b.version());
  await pg.route(/googlesyndication|doubleclick|fastcomments|googletagmanager/, r => r.abort()); pg.on("pageerror", e => { console.log("  PAGEERR", e.message); FAIL.push(e.message); });
  await pg.goto(BASE + "/photo/?t=" + Date.now()); await pg.waitForFunction(() => window.PE && PE.newDoc && PE.runAdjust);
  const sig = () => pg.evaluate(() => { const c = PE.flatten(), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0; return h; });
  async function fresh() { await pg.evaluate(async () => { document.querySelectorAll(".pe-modal").forEach(m => m.remove()); PE.newDoc(300, 200, "#ffffff", "t"); await new Promise(r => setTimeout(r, 80)); const L = PE.active(), x = L.canvas.getContext("2d"); for (let i = 0; i < 300; i += 20) { x.fillStyle = "hsl(" + i + ",80%,50%)"; x.fillRect(i, 0, 10, 200); } L.rev++; PE.commit("paint"); PE.invalidate(); }); return sig(); }
  async function open(which) { await pg.evaluate((w) => { if (w === "round") PE.dlgRoundCorners(); else PE.runAdjust(w); }, which); await pg.waitForTimeout(250); }
  async function change(which) {
    if (which === "curves") { const r = await pg.evaluate(() => { const c = document.querySelector(".pe-curve").getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; }); await pg.mouse.move(r.x, r.y); await pg.mouse.down(); await pg.mouse.move(r.x - 30, r.y - 40, { steps: 5 }); await pg.mouse.up(); }
    else await pg.evaluate(() => { const i = document.querySelector(".pe-dlg input[type=range]"); i.value = String(Math.round(+i.min + (+i.max - +i.min) * 0.8)); i.dispatchEvent(new Event("input", { bubbles: true })); });
    await pg.waitForTimeout(200);
  }
  async function close(how) { if (how === "x") await pg.click(".pe-dlg .pe-x"); else if (how === "esc") await pg.keyboard.press("Escape"); else await pg.click(".pe-dlg-f button >> text=" + how); await pg.waitForTimeout(250); }
  for (const w of ["blur", "hs", "levels", "curves", "round"]) {
    console.log(w);
    for (const how of ["x", "esc"]) { const s0 = await fresh(); await open(w); await change(w); await close(how); const s1 = await sig(), gone = await pg.evaluate(() => !document.querySelector(".pe-dlg"));
      await pg.evaluate(() => PE.undo()); await pg.waitForTimeout(100); const s2 = await sig(); ok(gone && s1 !== s0 && s2 === s0, `${w}: changed + closed with ${how}: kept, one Undo removes it`); }
    { const s0 = await fresh(); await open(w); await close("x"); ok((await sig()) === s0, `${w}: opened and closed untouched: picture unchanged`); }
    { const s0 = await fresh(); await open(w); await change(w); await close("Cancel"); ok((await sig()) === s0, `${w}: Cancel puts it back`); }
    { const s0 = await fresh(); await open(w); await change(w); await close("Apply"); ok((await sig()) !== s0, `${w}: Apply still applies`); }
  }
  await b.close(); console.log(FAIL.length ? "\n" + FAIL.length + " FAILED" : "\nall passed");
})();
