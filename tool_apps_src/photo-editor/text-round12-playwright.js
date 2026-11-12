/* MES Photo Editor round 12 (2026-11-12): a subscriber's text layer "no longer responding as a text layer". Checks, in a real browser, that
 * (A) brush / Delete / fill on a text layer ask first instead of silently rasterizing it ("Paint on a new layer", "Turn it into a picture", Undo),
 * (B) the Text tool's outline click still edits, an outline / grip drag moves, a grip click makes no new text,
 * (C) a text whose font never arrives (blocked Google font, font file not loaded) is never locked: editable, font setting kept.
 * Run like text-regression-playwright.js: serve mes.fm on 127.0.0.1:8445, then
 *   NODE_PATH=<folder>/node_modules node tool_apps_src/photo-editor/text-round12-playwright.js brave   (or chromium / chrome / firefox) */
const pw = require("playwright");
const BR = process.argv[2] || "firefox", BASE = process.argv[3] || "http://127.0.0.1:8445";
const FAIL = []; const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) FAIL.push(m); };
const ADS = /googlesyndication|doubleclick|google\.com\/recaptcha|adservice|fastcomments|googletagmanager/;
const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
async function launch() { return BR === "brave" ? pw.chromium.launch({ executablePath: BRAVE }) : BR === "chrome" ? pw.chromium.launch({ channel: "chrome" }) : pw[BR].launch(); }
async function openPage(b, blockFonts) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }), pg = await ctx.newPage();
  await pg.route(ADS, r => r.abort()); if (blockFonts) await pg.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  pg.on("pageerror", e => { console.log("  PAGEERR", e.message); FAIL.push("page error: " + e.message); });
  await pg.goto(BASE + "/photo/?t=" + Date.now()); await pg.waitForFunction(() => window.PE && PE.newDoc && PE.renderText && PE.textFrameCorners);
  return pg;
}
/* everything measured inside the page */
const MEASURE = () => {
  const L = PE.doc.layers.find(l => l.type === "text"), c = L.canvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let k = 0; k < c.width; k++) if (d[(y * c.width + k) * 4 + 3] > 40) { if (k < x0) x0 = k; if (k > x1) x1 = k + 1; if (y < y0) y0 = y; if (y > y1) y1 = y + 1; }
  let fx = null; if (PE.hasFx(L)) { const r = PE.fxCanvases(L); [].concat(r.under, r.over).forEach(p => { const e = p.c.getContext("2d").getImageData(0, 0, p.c.width, p.c.height).data; for (let y = 0; y < p.c.height; y++) for (let k = 0; k < p.c.width; k++) if (e[(y * p.c.width + k) * 4 + 3] > 40) { const u = k - r.mg, v = y - r.mg; if (!fx) fx = [u, v, u + 1, v + 1]; else { fx[0] = Math.min(fx[0], u); fx[1] = Math.min(fx[1], v); fx[2] = Math.max(fx[2], u + 1); fx[3] = Math.max(fx[3], v + 1); } } }); }
  const fc = PE.textFrameCorners(L).map(p => PE.toLayerPt(L, p[0], p[1])), frame = [fc[0].x, fc[0].y, fc[2].x, fc[2].y];
  const top = PE.textFramePt(L, 0, -1), mid = PE.textFramePt(L, 0, 0), rh = PE.rotHandlePt ? PE.rotHandlePt(L) : null;
  const lay = PE.textLayout(L), fam = MESFontCat.familyOf(L.text.font), m = document.createElement("canvas").getContext("2d");
  m.font = PE.textFont(L.text, PE.textMask(L.text)); const wReal = m.measureText(lay.lines[0].text).width; m.font = PE.textFont(L.text, PE.textMask(L.text)).replace(/px .*/, "px sans-serif"); const wFallback = m.measureText(lay.lines[0].text).width;
  return { font: L.text.font, fam, ink: [x0, y0, x1, y1], fx, frame, lines: lay.lines.map(s => s.text), wrapW: L.text.wrapW, inkW: x1 - x0, wReal, wFallback, rot: rh && { hx: rh.x, cx: PE.toScreen(mid.x, mid.y).x, tx: PE.toScreen(top.x, top.y).x }, rev: L.rev };
};
function encloses(m, tag) {
  const f = m.frame, inside = b => b[0] >= f[0] - 1 && b[1] >= f[1] - 1 && b[2] <= f[2] + 1 && b[3] <= f[3] + 1;
  ok(inside(m.ink), `${tag}: box ${f.map(Math.round)} encloses the drawn text ${m.ink}`);
  if (m.fx) ok(inside(m.fx), `${tag}: box encloses the layer style ${m.fx}`);
  if (m.rot) ok(Math.abs(m.rot.hx - m.rot.cx) < 1.5 && Math.abs(m.rot.tx - m.rot.cx) < 1.5, `${tag}: rotate handle centred (${m.rot.hx.toFixed(1)} vs ${m.rot.cx.toFixed(1)})`);
}
async function dragPill(pg, side, dist) {
  const p = await pg.evaluate((side) => { const L = PE.doc.layers.find(l => l.type === "text"), q = PE.textFramePt(L, side, 0), r = PE.els.over.getBoundingClientRect(), s = PE.toScreen(q.x, q.y); return { x: r.left + s.x, y: r.top + s.y }; }, side);
  await pg.mouse.move(p.x, p.y); await pg.mouse.down(); for (let k = 1; k <= 10; k++) await pg.mouse.move(p.x - side * k * dist / 10, p.y); await pg.mouse.up(); await pg.waitForTimeout(300);
}
async function makeText(pg, font, extra) {
  return pg.evaluate(async ({ font, extra }) => {
    PE.newDoc(900, 320, "#b080ff", "t"); await new Promise(r => setTimeout(r, 150));
    if (font.google) { await PE.loadGoogleFont(font.google); font.stack = "'" + font.google + "', cursive"; }
    if (font.file) { const bin = Uint8Array.from(atob(font.file), c => c.charCodeAt(0)); await PE.loadFontFile(new File([bin], "8bit Font.ttf")); font.stack = PE.opt.text.font; }
    const o = Object.assign(JSON.parse(JSON.stringify(PE.TEXTDEF)), { str: "Testing Text", font: font.stack, size: 48, bold: true, color: "#ffcc00", strokeOn: true, stroke: "#000000", strokeW: 6, shadowOn: true, shadowBlur: 10, shadowDx: 6, shadowDy: 6 }, extra || {});
    const L = PE.makeLayer({ type: "text", name: "T", text: o, w: 4, h: 4 }); PE.renderText(L); L.cx = 450; L.cy = 160; PE.addLayer(L); PE.setActive(L.id);
    L.fx = { outline: { on: true, w: 5, c: "#000000", pos: "outside", op: 1 }, shadow: { on: true, c: "#000000", op: 0.8, dist: 14, blur: 6, angle: 120, gl: false } };
    PE.commit("Add text"); PE.setTool("move"); PE.invalidate(); return font.stack;
  }, { font, extra });
}
const scr = (pg, fn, arg) => pg.evaluate(fn, arg);
async function at(pg, hx, hy, dy) { return pg.evaluate(({ hx, hy, dy }) => { const L = PE.doc.layers.find(l => l.type === "text"), q = PE.textFramePt(L, hx, hy), r = PE.els.over.getBoundingClientRect(), s = PE.toScreen(q.x, q.y); return { x: r.left + s.x, y: r.top + s.y + (dy || 0) }; }, { hx, hy, dy }); }
const state = pg => pg.evaluate(() => { const ts = PE.doc.layers.filter(l => l.type === "text"); const L = ts[0]; return { n: PE.doc.layers.length, texts: ts.length, type: L ? L.type : null, str: L && L.text ? L.text.str : null, font: L && L.text ? L.text.font : null, cx: L ? Math.round(L.cx) : 0, cy: L ? Math.round(L.cy) : 0, active: PE.active() && PE.active().type, editing: document.activeElement === PE.els.textedit, modal: (document.querySelector(".pe-dlg-h b") || {}).textContent || "" }; });
(async () => {
  const b = await launch(); console.log("Browser:", BR, b.version());
  // ---- A: brush / delete / fill on a text layer ask first; the text stays a text
  { console.log("paint tools on a text layer"); const pg = await openPage(b, false); await makeText(pg, { stack: "Georgia, serif" }); await pg.waitForTimeout(300);
    await scr(pg, () => PE.setTool("brush")); const c = await at(pg, 0, 0); await pg.mouse.move(c.x, c.y); await pg.mouse.down(); await pg.mouse.move(c.x + 40, c.y + 10); await pg.mouse.up(); await pg.waitForTimeout(300);
    let s = await state(pg); ok(s.type === "text", "brush did not turn the text into a picture (" + s.type + ")"); ok(/text layer/i.test(s.modal), "dialog explains it: " + s.modal);
    await scr(pg, () => [...document.querySelectorAll(".pe-dlg-f button")].find(b => /new layer/i.test(b.textContent)).click()); await pg.waitForTimeout(200);
    s = await state(pg); ok(s.texts === 1 && s.type === "text" && s.active === "raster" && s.n === 3, `"Paint on a new layer" added an empty layer above (${s.n} layers, active ${s.active})`);
    await pg.mouse.move(c.x, c.y); await pg.mouse.down(); await pg.mouse.move(c.x + 60, c.y); await pg.mouse.up(); await pg.waitForTimeout(200); s = await state(pg); ok(!s.modal && s.type === "text", "painting on the new layer works, no dialog");
    await scr(pg, () => { PE.setActive(PE.doc.layers.find(l => l.type === "text").id); PE.selAll(); }); await pg.keyboard.press("Delete"); await pg.waitForTimeout(200);
    s = await state(pg); ok(s.type === "text", "Delete with a selection keeps the text (" + (s.modal || "no dialog") + ")");
    await scr(pg, () => { const m = [...document.querySelectorAll(".pe-dlg-f button")].find(b => /picture/i.test(b.textContent)); m && m.click(); }); await pg.waitForTimeout(200);
    s = await pg.evaluate(() => PE.doc.layers.map(l => l.type).join(",")); ok(/raster,raster,raster/.test(s) || !/text/.test(s), "\"Turn it into a picture\" rasterizes when asked (" + s + ")");
    await scr(pg, () => PE.undo()); await pg.waitForTimeout(200); s = await state(pg); ok(s.type === "text" && s.str === "Testing Text", "Undo brings the text back");
    await pg.context().close(); }
  // ---- B: Text tool: edge click edits, edge drag moves, grip click makes no new text
  { console.log("Text tool: outline and grip"); const pg = await openPage(b, false); await makeText(pg, { stack: "Georgia, serif" }, { fx: null }); await scr(pg, () => { const L = PE.doc.layers.find(l => l.type === "text"); L.fx = null; PE.setTool("text"); PE.invalidate(); }); await pg.waitForTimeout(200);
    let s0 = await state(pg), e = await at(pg, -0.5, -1); await pg.mouse.click(e.x, e.y + 1); await pg.waitForTimeout(250);
    let s = await state(pg); ok(s.editing && s.cx === s0.cx, "a click on the outline opens the text for typing and does not move it");
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(150); e = await at(pg, -0.5, -1); e.y += 1; e.x -= 1;
    await pg.mouse.move(e.x + 1, e.y); await pg.mouse.down(); for (let k = 1; k <= 8; k++) await pg.mouse.move(e.x + 1 + k * 10, e.y + k * 5); await pg.mouse.up(); await pg.waitForTimeout(200);
    s = await state(pg); ok(s.cx !== s0.cx && s.str === "Testing Text" && s.texts === 1, `dragging the outline moves the text (${s0.cx},${s0.cy} -> ${s.cx},${s.cy})`);
    const g = await at(pg, 0, 1, 24); await pg.mouse.click(g.x, g.y); await pg.waitForTimeout(200); s = await state(pg); ok(s.texts === 1, "a click on the grip does not start a new text (" + s.texts + ")");
    const m0 = await state(pg); await pg.mouse.move(g.x, g.y); await pg.mouse.down(); await pg.mouse.move(g.x - 50, g.y - 30, { steps: 6 }); await pg.mouse.up(); await pg.waitForTimeout(200);
    s = await state(pg); ok(s.cx < m0.cx && s.cy < m0.cy, "the grip moves the text"); await scr(pg, () => PE.undo()); await pg.waitForTimeout(150); s = await state(pg); ok(s.cx === m0.cx, "Undo puts it back");
    const mid = await at(pg, 0, 0); await pg.mouse.click(mid.x, mid.y); await pg.waitForTimeout(150); await pg.keyboard.press("End"); await pg.keyboard.type("!"); await pg.keyboard.press("Escape"); await pg.waitForTimeout(200);
    s = await state(pg); ok(s.str === "Testing Text!", "clicking inside still types (" + s.str + ")");
    await pg.context().close(); }
  // ---- C: a project whose Google font never arrives is editable after the wait; a missing font file at once
  { console.log("missing fonts never lock a text"); let pg = await openPage(b, false); await makeText(pg, { google: "Press Start 2P" });
    const proj = await pg.evaluate(async () => { const bl = await PE.projectBlob(), u = new Uint8Array(await bl.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }); await pg.context().close();
    pg = await openPage(b, true); await pg.evaluate(async (s) => { const bin = Uint8Array.from(atob(s), c => c.charCodeAt(0)); await PE.loadProject(bin.buffer, "t.mesproj"); PE.setActive(PE.doc.layers.find(l => l.type === "text").id); PE.setTool("text"); }, proj);
    await pg.waitForTimeout(12500); const mid = await at(pg, 0, 0); await pg.mouse.click(mid.x, mid.y); await pg.waitForTimeout(200); await pg.keyboard.press("End"); await pg.keyboard.type(" OK"); await pg.keyboard.press("Escape"); await pg.waitForTimeout(250);
    let s = await state(pg); ok(s.str === "Testing Text OK", "blocked Google font: text editable after the wait (" + s.str + ")"); ok(/Press Start 2P/.test(s.font), "its font setting is kept (" + s.font + ")");
    await scr(pg, () => { PE.optSet ? PE.optSet("text", "font", "Georgia, serif") : null; const L = PE.active(); L.text.font = "Georgia, serif"; PE.renderText(L); }); s = await state(pg); ok(s.font === "Georgia, serif", "and another font can be picked");
    await pg.context().close();
    pg = await openPage(b, false); await pg.evaluate(async () => { PE.newDoc(900, 320, "#fff", "t"); await new Promise(r => setTimeout(r, 100)); const o = Object.assign(JSON.parse(JSON.stringify(PE.TEXTDEF)), { str: "File font", font: "'MESfileGonexq', 'Gone Font', sans-serif", size: 48 });
      const L = PE.makeLayer({ type: "text", name: "T", text: o, w: 4, h: 4 }); L.canvas = PE.mk(300, 80); L.canvas.getContext("2d").fillRect(10, 10, 200, 50); L.cx = 450; L.cy = 160; L._drawnFont = undefined; PE.addLayer(L); PE.setActive(L.id); PE.commit("x"); PE.setTool("text"); });
    const m2 = await at(pg, 0, 0); await pg.mouse.click(m2.x, m2.y); await pg.waitForTimeout(200); await pg.keyboard.press("End"); await pg.keyboard.type("!"); await pg.keyboard.press("Escape"); await pg.waitForTimeout(200);
    s = await state(pg); ok(s.str === "File font!", "font file not loaded: still editable at once (" + s.str + ")");
    await pg.context().close(); }
  await b.close(); console.log(FAIL.length ? "\n" + FAIL.length + " FAILED" : "\nall passed");
})();
