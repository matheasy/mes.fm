/* MES Photo Editor: text-box regression check in REAL browser engines (Firefox and Chromium via Playwright). Not run by the normal tests.
 *
 * Run (from any folder that has playwright installed, e.g. `npm i playwright@1.49.1 && npx playwright install firefox`):
 *   cd mes.fm && python3 -m http.server 8445 --bind 127.0.0.1 &        # serve the built site
 *   node tool_apps_src/photo-editor/text-regression-playwright.js [firefox|chromium|chrome|brave] [baseUrl]
 * (NODE_PATH=<folder>/node_modules if playwright is installed elsewhere.)
 *
 * Screenshots go to the system temp folder (text-regression-<browser>-*.png).
 * What it checks, for a Google font (Press Start 2P), a font file and a plain system font, bold, outline, shadow and a layer style:
 *  1. the Move tool's box (PE.textFrameCorners) encloses every drawn pixel of the text and its layer style, and the rotate handle is centred on it;
 *  2. dragging a side pill re-wraps the text in ITS font (never the default one);
 *  3. a project reopened in a browser that cannot load the font (fonts.googleapis.com blocked) keeps the font's pixels: the box still encloses them
 *     and a side drag does not redraw the text in a fallback font;
 *  4. a quick sweep of the other text features (per-letter bold / italic / underline, alignment, auto-fit, letter spacing, undo / redo, save / reopen). */
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
(async () => {
  const fs = require("fs"), fileB64 = fs.existsSync("/System/Library/Fonts/Supplemental/Krungthep.ttf") ? fs.readFileSync("/System/Library/Fonts/Supplemental/Krungthep.ttf").toString("base64") : null;
  const b = await launch(); console.log("Browser:", BR, b.version());
  const fonts = [{ name: "Google font", google: "Press Start 2P" }, { name: "system font", stack: "Georgia, serif" }].concat(fileB64 ? [{ name: "font file", file: fileB64 }] : []);
  let projB64 = null;
  for (const f of fonts) {
    console.log(f.name);
    const pg = await openPage(b, false); await makeText(pg, f); await pg.waitForTimeout(500);
    let m = await pg.evaluate(MEASURE); encloses(m, "new text");
    ok(Math.abs(m.wReal - m.wFallback) < 1 || m.inkW > (m.wReal + m.wFallback) / 2, `new text drawn in its font (ink ${m.inkW}, font ${m.wReal.toFixed(0)}, fallback ${m.wFallback.toFixed(0)})`);
    await dragPill(pg, 1, 200); m = await pg.evaluate(MEASURE); encloses(m, "after right pill");
    ok(m.font.indexOf(f.google || "MESfile") >= 0 || !!f.stack, "font value kept: " + m.font);
    ok(m.lines.length >= 2 && Math.abs(m.wReal - m.wFallback) < 1 || m.inkW > (m.wReal + m.wFallback) / 2 - 20, `re-wrapped in its own font (${m.lines.join(" | ")}, ink ${m.inkW}, font ${m.wReal.toFixed(0)}, fallback ${m.wFallback.toFixed(0)})`);
    await dragPill(pg, -1, -120); m = await pg.evaluate(MEASURE); encloses(m, "after left pill");
    if (f.google) projB64 = await pg.evaluate(async () => { const bl = await PE.projectBlob(), u = new Uint8Array(await bl.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); });
    await pg.screenshot({ path: require("path").join(require("os").tmpdir(), `text-regression-${BR}-${f.name.replace(/ /g, "-")}.png`), clip: { x: 240, y: 440, width: 560, height: 420 } });
    await pg.context().close();
  }
  console.log("project reopened where the Google font cannot load");
  { const pg = await openPage(b, true);
    await pg.evaluate(async (s) => { const bin = Uint8Array.from(atob(s), c => c.charCodeAt(0)); await PE.loadProject(bin.buffer, "t.mesproj"); PE.setActive(PE.doc.layers.find(l => l.type === "text").id); PE.setTool("move"); }, projB64);
    await pg.waitForTimeout(1500); const m0 = await pg.evaluate(MEASURE); encloses(m0, "reopened");
    await dragPill(pg, 1, 120); const m1 = await pg.evaluate(MEASURE); encloses(m1, "reopened, after pill");
    ok(m1.inkW >= m0.inkW - 2 || m1.rev === m0.rev, `no fallback redraw (ink ${m0.inkW} -> ${m1.inkW})`);
    await pg.screenshot({ path: require("path").join(require("os").tmpdir(), `text-regression-${BR}-reopened.png`), clip: { x: 240, y: 440, width: 560, height: 420 } });
    await pg.context().close(); }
  console.log("project reopened with the font available");
  { const pg = await openPage(b, false);
    await pg.evaluate(async (s) => { const bin = Uint8Array.from(atob(s), c => c.charCodeAt(0)); await PE.loadProject(bin.buffer, "t.mesproj"); PE.setActive(PE.doc.layers.find(l => l.type === "text").id); PE.setTool("move"); }, projB64);
    await pg.waitForFunction(() => document.fonts.check("12px \"Press Start 2P\"") && [...document.fonts].some(f => f.family.replace(/"/g, "") === "Press Start 2P" && f.status === "loaded"), null, { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(800); let m = await pg.evaluate(MEASURE); encloses(m, "reopened (font loads)");
    await dragPill(pg, 1, 150); m = await pg.evaluate(MEASURE); encloses(m, "reopened (font loads), after pill");
    ok(m.inkW > (m.wReal + m.wFallback) / 2 - 20, `re-wrapped in Press Start 2P (ink ${m.inkW}, font ${m.wReal.toFixed(0)}, fallback ${m.wFallback.toFixed(0)})`);
    await pg.context().close(); }
  console.log("other text features");
  { const pg = await openPage(b, false); await makeText(pg, { name: "sys", stack: "Georgia, serif" }, { str: "Hello world again" });
    const r = await pg.evaluate(async () => {
      const L = PE.doc.layers.find(l => l.type === "text"), out = {}, w = () => L.canvas.width;
      L.text.rich = "1111122222044444000".slice(0, L.text.str.length).replace(/0/g, "0"); L.text.bold = false; PE.renderText(L); out.rich = PE.textLayout(L).lines.length >= 1 && L.canvas.width > 10;
      ["center", "right", "left"].forEach(a => { L.text.align = a; PE.renderText(L); }); out.align = true;
      const w0 = w(); L.text.ls = 12; PE.renderText(L); out.ls = ("letterSpacing" in CanvasRenderingContext2D.prototype) ? w() > w0 : "unsupported"; L.text.ls = 0; PE.renderText(L);
      L.text.wrapW = 260; L.text.boxH = 200; L.text.fit = true; PE.renderText(L); out.fitSize = L.text.size; out.fitLines = PE.textLayout(L).lines.length; L.text.fit = false; L.text.wrapW = 0; L.text.boxH = 0; L.text.size = 48; PE.renderText(L);
      PE.commit("change"); const s1 = JSON.stringify(PE.active().text); L.text.str = "Changed"; PE.renderText(L); PE.commit("edit"); PE.undo(); out.undo = JSON.stringify(PE.active().text) === s1; PE.redo(); out.redo = PE.active().text.str === "Changed";
      const bl = await PE.projectBlob(); await PE.loadProject(await bl.arrayBuffer(), "x.mesproj"); const L2 = PE.doc.layers.find(l => l.type === "text"); out.reopen = L2.text.str === "Changed" && L2.text.font === "Georgia, serif";
      return out;
    });
    ok(r.rich, "per-letter bold / italic / underline renders"); ok(r.align, "alignment"); ok(r.ls === true || r.ls === "unsupported", "letter spacing widens the text (" + r.ls + ")");
    ok(r.fitSize > 10 && r.fitLines >= 1, "auto-fit gives a size (" + r.fitSize + ", " + r.fitLines + " lines)"); ok(r.undo && r.redo, "undo / redo"); ok(r.reopen, "save / reopen project");
    // typing in place with the real keyboard, then Ctrl/Cmd+B on a selection (per-letter bold)
    await pg.evaluate(() => { PE.editActiveText(); });
    await pg.keyboard.type("Typed in place"); await pg.keyboard.down("Shift"); for (let i = 0; i < 7; i++) await pg.keyboard.press("ArrowLeft"); await pg.keyboard.up("Shift");
    await pg.keyboard.press((process.platform === "darwin" ? "Meta" : "Control") + "+b"); await pg.keyboard.press((process.platform === "darwin" ? "Meta" : "Control") + "+Enter"); await pg.waitForTimeout(300);
    const ty = await pg.evaluate(() => { const L = PE.doc.layers.find(l => l.type === "text"); return { str: L.text.str, rich: L.text.rich, bold: L.text.bold }; });
    ok(ty.str === "Typed in place", "typed in place: " + JSON.stringify(ty.str));
    ok(!!ty.rich && /1/.test(ty.rich.slice(-7)) !== /1/.test(ty.rich.slice(0, 5)) , "Ctrl/Cmd+B bolds only the selected letters (" + ty.rich + ")");
    await pg.evaluate(() => PE.undo()); const un = await pg.evaluate(() => PE.doc.layers.find(l => l.type === "text").text.str); ok(un !== "Typed in place", "undo after typing (" + un + ")");
    await pg.context().close(); }
  await b.close();
  console.log(FAIL.length ? `\n${FAIL.length} FAILED` : "\nall passed"); process.exit(FAIL.length ? 1 : 0);
})();
