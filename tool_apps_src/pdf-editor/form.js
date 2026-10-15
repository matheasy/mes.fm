/* MES PDF Editor: fill the fillable fields (AcroForm widgets) of a PDF. pdf.js reports each field's rectangle; real inputs sit over the page, and what the person types becomes an ordinary
 * annotation (text / check mark) tagged with the field (formKey), so undo, rotate-free export and flattening all work as for everything else. Uses PD. */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$;
	PD.fields = async function (p) {
		if (p._ff) return p._ff; if (p.blank || !p.proxy) return (p._ff = []);
		try { var an = await p.proxy.getAnnotations({ intent: "display" }); p._ff = an.filter(function (a) { return a.subtype === "Widget" && a.rect && !a.readOnly && !a.pushButton && (a.fieldType === "Tx" || a.fieldType === "Btn" || a.fieldType === "Ch") && !a.hidden; }); } catch (e) { p._ff = []; }
		return p._ff;
	};
	function rectOf(f) { var r = f.rect, x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), y0 = Math.min(r[1], r[3]), y1 = Math.max(r[1], r[3]); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
	function key(f) { return f.fieldType === "Btn" && f.radioButton ? "r:" + f.fieldName : "f:" + (f.id || f.fieldName); }
	function annotFor(p, k) { for (var i = 0; i < p.annots.length; i++) if (p.annots[i].formKey === k) return p.annots[i]; return null; }
	function drop(p, k) { p.annots = p.annots.filter(function (a) { return a.formKey !== k; }); }
	function setText(p, f, value) {
		var k = key(f), r = rectOf(f), old = annotFor(p, k); if (!String(value).trim()) { if (old) { drop(p, k); return true; } return false; }
		var multi = !!f.multiLine, size = multi ? 11 : Math.max(7, Math.min(16, r.h * 0.62)), baseline = multi ? r.y + r.h - 3 - size * M.ASCENT : r.y + (r.h - size) / 2 + size * 0.22, top = baseline + M.PAD + M.ASCENT * size;
		if (old && old.text === value) return false; drop(p, k); var a = PD.makeText(p, r.x - M.PAD + 1, top, { size: size, font: "sans", color: "#000000", w: r.w + M.PAD * 2 - 2 }, value); a.formKey = k; p.annots.push(a); return true;
	}
	function setCheck(p, f, on, radioGroup) {
		var k = key(f), r = rectOf(f); drop(p, k); if (!on) return;
		var s = Math.min(r.w, r.h), a = { id: M.newId("a"), t: "stamp", kind: "check", x: r.x + (r.w - s) / 2, y: r.y + (r.h - s) / 2, w: s, h: s, color: "#000000", formKey: k, formValue: f.buttonValue || f.exportValue || "" }; p.annots.push(a);
	}
	var pending = null; function commitSoon() { clearTimeout(pending); pending = setTimeout(function () { PD.commit(); }, 250); }
	async function build(p) {
		var el = PD.pageEl(p); if (!el) return; var old = el.querySelector(".pd-ff"); if (old) old.remove(); if (PD.tool !== "form") return;
		var fl = await PD.fields(p); if (!fl.length) return; var vp = PD.vp(p), box = document.createElement("div"); box.className = "pd-ff"; box.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
		if (vp.rot !== 0) { var n = document.createElement("div"); n.className = "pd-note"; n.style.cssText = "position:absolute;left:6px;top:6px;background:#fff8d6;color:#333;padding:4px 8px;border-radius:4px;pointer-events:auto"; n.textContent = "Rotated page: form fields cannot be filled here. Rotate it back or use the Text tool."; box.appendChild(n); el.appendChild(box); return; }
		var s = PD.zoom;
		fl.forEach(function (f) {
			var r = rectOf(f), a = vp.toView(r.x, r.y + r.h), k = key(f), cur = annotFor(p, k), inp;
			var st = "position:absolute;pointer-events:auto;box-sizing:border-box;left:" + a[0] + "px;top:" + a[1] + "px;width:" + (r.w * s) + "px;height:" + (r.h * s) + "px;margin:0;";
			var fs = Math.max(7, Math.min(16, r.h * 0.62)) * s, look = "background:rgba(222,234,255,0.9);border:1px solid rgba(26,115,232,0.6);color:#000;font:" + fs + "px Helvetica,Arial,sans-serif;padding:0 2px;outline:none;";
			if (f.fieldType === "Tx") {
				inp = document.createElement(f.multiLine ? "textarea" : "input"); if (!f.multiLine) inp.type = f.password ? "password" : "text"; if (f.maxLen) inp.maxLength = f.maxLen; inp.value = cur ? cur.text : (f.fieldValue || ""); inp.style.cssText = st + look + (f.multiLine ? "resize:none;padding:2px;line-height:1.15;font-size:" + (11 * s) + "px;" : "");
				inp.setAttribute("aria-label", f.alternativeText || f.fieldName || "Form field"); inp.addEventListener("input", function () { if (setText(p, f, inp.value)) { PD.repaint(p); commitSoon(); } });
			} else if (f.fieldType === "Ch") {
				inp = document.createElement("select"); inp.style.cssText = st + look; var opts = f.options || []; inp.innerHTML = '<option value=""></option>' + opts.map(function (o) { return '<option value="' + M.esc(o.exportValue) + '">' + M.esc(o.displayValue || o.exportValue) + "</option>"; }).join(""); var sv = cur ? cur.text : Array.isArray(f.fieldValue) ? f.fieldValue[0] : f.fieldValue; opts.forEach(function (o) { if (sv === o.displayValue || sv === o.exportValue) inp.value = o.exportValue; });
				inp.setAttribute("aria-label", f.alternativeText || f.fieldName || "Form drop-down"); inp.addEventListener("change", function () { var o = opts.filter(function (x) { return x.exportValue === inp.value; })[0]; if (setText(p, f, o ? (o.displayValue || o.exportValue) : "")) { PD.repaint(p); commitSoon(); } });
			} else {   // check box or radio button
				inp = document.createElement("input"); inp.type = f.radioButton ? "radio" : "checkbox"; inp.style.cssText = st + "opacity:0.001;cursor:pointer;"; var wrapStyle = "position:absolute;pointer-events:none;box-sizing:border-box;left:" + a[0] + "px;top:" + a[1] + "px;width:" + (r.w * s) + "px;height:" + (r.h * s) + "px;background:rgba(222,234,255,0.9);border:1px solid rgba(26,115,232,0.6);";
				var vis = document.createElement("div"); vis.style.cssText = wrapStyle + "display:flex;align-items:center;justify-content:center;color:#000;font:bold " + (Math.min(r.w, r.h) * s * 0.85) + "px sans-serif;line-height:1;"; var on = !!cur || (!cur && !annotFor(p, key(f)) && (f.fieldValue && f.fieldValue !== "Off" && f.fieldValue === (f.buttonValue || f.exportValue || "Yes") || f.fieldValue === true)); inp.checked = !!cur; vis.textContent = cur ? "✓" : ""; box.appendChild(vis);
				inp.setAttribute("aria-label", f.alternativeText || f.fieldName || "Form option"); inp.addEventListener("change", function () { if (f.radioButton) { var grp = (p._ff || []).filter(function (x) { return x.radioButton && x.fieldName === f.fieldName; }); drop(p, key(f)); if (inp.checked) setCheck(p, f, true); box.querySelectorAll('input[type=radio]').forEach(function (rr) { if (rr !== inp && rr.dataset.g === f.fieldName) { rr.checked = false; rr._vis.textContent = ""; } }); } else setCheck(p, f, inp.checked); vis.textContent = inp.checked ? "✓" : ""; PD.repaint(p); commitSoon(); }); inp.dataset.g = f.fieldName || ""; inp._vis = vis;
			}
			box.appendChild(inp);
		});
		el.appendChild(box);
	}
	PD.formRefresh = function () { if (!PD.doc) return; PD.doc.pages.forEach(function (p) { build(p); PD.repaint(p); }); };
	PD.on("layout", function () { if (PD.tool === "form") PD.formRefresh(); }); PD.on("history", function () { if (PD.tool === "form") PD.formRefresh(); });
	PD.on("rendered", function (p) { if (PD.tool === "form") build(p); });
	// tell the person when a PDF has fillable fields
	PD.on("open", function () {
		(async function () { var n = 0, d = PD.doc; if (!d) return; for (var i = 0; i < Math.min(d.pages.length, 40); i++) { n += (await PD.fields(d.pages[i])).length; if (n) break; } if (PD.doc === d && n) { PD.toast("This PDF has fillable fields. Choose the Fill form tool to type into them.", 5000); var b = $("pd-tools").querySelector('[data-t="form"]'); if (b) { b.style.outline = "2px solid var(--pd-on)"; setTimeout(function () { b.style.outline = ""; }, 6000); } } })();
	});
})();
