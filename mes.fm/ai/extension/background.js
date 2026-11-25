/* MES AI Helper (mes.fm/ai): the service worker that does the browser steps of a MES AI task.
   Commands come only from the bridge content script on mes.fm/ai pages (sender = that tab). The AI never acts on the
   mes.fm/ai tab itself. Tabs it opens go into one "MES AI" window, in a tab group, so your own tabs stay where they are.
   Pure page work (reading, clicking, typing) runs as injected functions below; nothing is sent anywhere but back to the page. */
"use strict";

const ST = { win: null, cur: null, mine: [], group: null, ai: null };   // ai = the mes.fm/ai tab that gives the orders
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function loadState() { try { const s = await chrome.storage.session.get("st"); if (s.st) Object.assign(ST, s.st); } catch (e) {} }
function saveState() { try { chrome.storage.session.set({ st: { win: ST.win, cur: ST.cur, mine: ST.mine, group: ST.group, ai: ST.ai } }); } catch (e) {} }
const ready = loadState();

async function enabled() { const s = await chrome.storage.local.get("on"); return s.on !== false; }

const okUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch (e) { return false; } };
function fixUrl(u) {
	u = String(u || "").trim();
	if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
	if (!okUrl(u)) throw new Error("Only http / https addresses can be opened.");
	return u;
}

async function tabOf(id) {
	const t = id == null ? (ST.cur != null ? ST.cur : null) : Number(id);
	if (t == null) throw new Error("No tab yet: use open_tab, or list_tabs and switch_tab.");
	let tab;
	try { tab = await chrome.tabs.get(t); } catch (e) { throw new Error("Tab " + t + " is closed. Use list_tabs."); }
	if (t === ST.ai) throw new Error("That is the MES AI tab itself: use another tab.");
	if (!okUrl(tab.url || tab.pendingUrl || "")) throw new Error("This tab shows a browser page (" + (tab.url || "") + ") that extensions may not touch.");
	return tab;
}
async function waitLoaded(tabId, ms) {
	const end = Date.now() + (ms || 15000);
	await sleep(250);
	while (Date.now() < end) {
		let t; try { t = await chrome.tabs.get(tabId); } catch (e) { return; }
		if (t.status === "complete") { await sleep(300); return; }
		await sleep(250);
	}
}
async function inject(tabId, func, args) {
	const r = await chrome.scripting.executeScript({ target: { tabId }, func, args: args || [], world: "ISOLATED" });
	const v = r && r[0] ? r[0].result : null;
	if (v && v.error) throw new Error(v.error);
	return v;
}
async function addMine(tab) {
	if (ST.mine.indexOf(tab.id) < 0) ST.mine.push(tab.id);
	try {
		if (ST.group != null) { try { await chrome.tabs.group({ groupId: ST.group, tabIds: [tab.id] }); return; } catch (e) { ST.group = null; } }
		ST.group = await chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId: tab.windowId } });
		await chrome.tabGroups.update(ST.group, { title: "MES AI", color: "purple" });
	} catch (e) {}
}
async function banner(tabId, on) { try { await inject(tabId, pageBanner, [!!on]); } catch (e) {} }

/* ---------- commands ---------- */
const CMD = {
	async hello() { return { version: chrome.runtime.getManifest().version, on: await enabled() }; },
	async list_tabs() {
		const tabs = await chrome.tabs.query({});
		return tabs.filter((t) => t.id !== ST.ai).map((t) => ({ tab: t.id, title: (t.title || "").slice(0, 120), url: (t.url || "").slice(0, 200), active: t.active && t.id === ST.cur, yours: ST.mine.indexOf(t.id) < 0 ? undefined : true, browserPage: !okUrl(t.url || "") || undefined }));
	},
	async open_tab(a) {
		const url = fixUrl(a.url);
		let tab;
		let win = null;
		if (ST.win != null) { try { win = await chrome.windows.get(ST.win); } catch (e) { win = null; } }
		if (!win) {
			const aiTab = ST.ai != null ? await chrome.tabs.get(ST.ai).catch(() => null) : null;
			const aiWin = aiTab ? await chrome.windows.get(aiTab.windowId).catch(() => null) : null;
			const opts = { url, focused: false, type: "normal" };
			if (aiWin && aiWin.width) { opts.width = Math.max(800, Math.round(aiWin.width * 0.6)); opts.height = aiWin.height; opts.left = (aiWin.left || 0) + aiWin.width - opts.width; opts.top = aiWin.top || 0; }
			try { win = await chrome.windows.create(opts); }
			catch (e) { win = await chrome.windows.create({ url, focused: false, type: "normal" }); }   // a size off the screen (several monitors, headless) is refused: plain window
			ST.win = win.id; ST.group = null;
			tab = win.tabs[0];
		} else tab = await chrome.tabs.create({ windowId: ST.win, url, active: true });
		ST.cur = tab.id; await addMine(tab); saveState();
		await waitLoaded(tab.id); await banner(tab.id, true);
		const t = await chrome.tabs.get(tab.id);
		return { tab: t.id, title: t.title, url: t.url };
	},
	async go_to(a) {
		const tab = await tabOf(a.tab); const url = fixUrl(a.url);
		await chrome.tabs.update(tab.id, { url }); ST.cur = tab.id; saveState();
		await waitLoaded(tab.id); await banner(tab.id, true);
		const t = await chrome.tabs.get(tab.id); return { tab: t.id, title: t.title, url: t.url };
	},
	async switch_tab(a) {
		const tab = await tabOf(a.tab); await chrome.tabs.update(tab.id, { active: true });
		ST.cur = tab.id; saveState(); await banner(tab.id, true);
		return { tab: tab.id, title: tab.title, url: tab.url };
	},
	async close_tab(a) {
		const tab = await tabOf(a.tab);
		if (ST.mine.indexOf(tab.id) < 0) throw new Error("Only tabs the AI opened can be closed.");
		await chrome.tabs.remove(tab.id); ST.mine = ST.mine.filter((x) => x !== tab.id); if (ST.cur === tab.id) ST.cur = null; saveState();
		return { closed: tab.id };
	},
	async read_page(a) {
		const tab = await tabOf(a.tab); ST.cur = tab.id; saveState(); await banner(tab.id, true);
		const r = await inject(tab.id, pageRead, [String(a.find || ""), Number(a.max) || 12000]);
		r.tab = tab.id; return r;
	},
	async screenshot(a) {
		const tab = await tabOf(a.tab); ST.cur = tab.id; saveState();
		await chrome.tabs.update(tab.id, { active: true }); await banner(tab.id, false); await sleep(350);
		let url;
		try { url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 60 }); }
		catch (e) { await banner(tab.id, true); throw new Error("Could not take the screenshot (is that window minimised?)."); }
		await banner(tab.id, true);
		const bmp = await createImageBitmap(await (await fetch(url)).blob());
		const k = Math.min(1, 1280 / bmp.width), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
		const c = new OffscreenCanvas(w, h); c.getContext("2d").drawImage(bmp, 0, 0, w, h);
		const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.6 });
		const buf = new Uint8Array(await blob.arrayBuffer()); let s = "";
		for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
		return { tab: tab.id, w, h, jpeg: btoa(s) };
	},
	async click(a) { return act(a, pageClick, [Number(a.ref)]); },
	async type(a) { return act(a, pageType, [Number(a.ref), String(a.text == null ? "" : a.text), !!a.append, !!a.enter]); },
	async select_option(a) { return act(a, pageSelect, [Number(a.ref), String(a.option || "")]); },
	async scroll(a) { const tab = await tabOf(a.tab); return inject(tab.id, pageScroll, [a.direction || "", a.ref == null ? null : Number(a.ref)]); },
	async press_key(a) { return act(a, pageKey, [String(a.key || "")]); },
	async wait(a) { await sleep(Math.min(10, Math.max(1, Number(a.seconds) || 1)) * 1000); return { waited: true }; },
	async done() { for (const id of ST.mine.concat(ST.cur != null ? [ST.cur] : [])) await banner(id, false); return { ok: true }; },
	async label(a) { const tab = await tabOf(a.tab); return inject(tab.id, pageLabel, [Number(a.ref)]); }
};
// a step that may load a new page: run it, then wait for the tab to settle and report where it ended up
async function act(a, fn, args) {
	const tab = await tabOf(a.tab); ST.cur = tab.id; saveState();
	const before = tab.url;
	const r = await inject(tab.id, fn, args) || {};
	await sleep(700);
	await waitLoaded(tab.id, 10000);
	const t = await chrome.tabs.get(tab.id).catch(() => null);
	if (t) { r.url = t.url; if (t.url !== before) { r.navigated = true; r.title = t.title; await banner(tab.id, true); } }
	return r;
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
	if (m && m.fromBanner === "stop") { if (ST.ai != null) chrome.tabs.sendMessage(ST.ai, { stopTask: true }).catch(() => {}); reply({ ok: true }); return; }
	if (m && m.fromPopup === "stop") { if (ST.ai != null) chrome.tabs.sendMessage(ST.ai, { stopTask: true }).catch(() => {}); CMD.done(); reply({ ok: true }); return; }
	if (!m || typeof m.cmd !== "string" || !sender.tab) return;
	const u = sender.tab.url || "";
	if (!/^https:\/\/mes\.fm\/ai([-/?#]|$)/.test(u) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u)) { reply({ ok: false, error: "Not allowed from this page." }); return; }
	const f = CMD[m.cmd];
	if (!f) { reply({ ok: false, error: "Unknown step: " + m.cmd }); return; }
	(async () => {
		await ready;
		if (m.cmd !== "hello" && !(await enabled())) throw new Error("The MES AI Helper is switched off (click its toolbar button to switch it on).");
		ST.ai = sender.tab.id; saveState();
		return f(m.args || {});
	})().then((result) => reply({ ok: true, result }), (e) => reply({ ok: false, error: String(e && e.message || e) }));
	return true;
});
chrome.tabs.onRemoved.addListener((id) => { if (ST.mine.indexOf(id) >= 0) { ST.mine = ST.mine.filter((x) => x !== id); if (ST.cur === id) ST.cur = null; saveState(); } });
chrome.windows.onRemoved.addListener((id) => { if (id === ST.win) { ST.win = null; ST.group = null; saveState(); } });

/* ---------- functions run inside the web page (each must be self-contained) ---------- */
function pageRead(find, max) {
	const sel = 'a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],[role=textbox],[contenteditable=""],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"])';
	document.querySelectorAll("[data-mesai]").forEach((e) => e.removeAttribute("data-mesai"));
	const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; const s = getComputedStyle(e); if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return null; return r; };
	const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
	const words = clean(find).toLowerCase().split(" ").filter(Boolean);
	const has = (t) => !words.length || words.some((w) => t.toLowerCase().indexOf(w) >= 0);
	const els = [], seen = new Set(); let n = 0;
	for (const e of document.querySelectorAll(sel)) {
		if (seen.has(e) || e.closest("[data-mesai-banner]")) continue;
		if (e.parentElement && e.parentElement.closest("a[href],button") && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)) continue;
		const r = vis(e); if (!r) continue; seen.add(e);
		const tag = e.tagName.toLowerCase(), type = (e.getAttribute("type") || "").toLowerCase(), role = e.getAttribute("role");
		let kind = role || (tag === "a" ? "link" : tag === "input" ? (type || "text") + " field" : tag === "textarea" ? "text box" : tag === "select" ? "drop-down" : e.isContentEditable ? "text box" : tag);
		if (tag === "input" && /^(submit|button|reset)$/.test(type)) kind = "button";
		let label = clean(e.getAttribute("aria-label") || (tag === "input" || tag === "textarea" ? "" : e.innerText) || e.getAttribute("title") || e.getAttribute("alt") || "");
		if (!label && e.labels && e.labels[0]) label = clean(e.labels[0].innerText);
		if (!label) label = clean(e.getAttribute("placeholder") || e.getAttribute("name") || (e.querySelector("img[alt]") || {}).alt || "");
		let val = "";
		if (tag === "input" && type === "password") val = " (password field: the person types this)";
		else if ((tag === "input" && !/^(submit|button|reset|checkbox|radio|file)$/.test(type)) || tag === "textarea") val = e.value ? ' value="' + clean(e.value).slice(0, 80) + '"' : "";
		else if (tag === "select") val = ' chosen="' + clean(e.options[e.selectedIndex] && e.options[e.selectedIndex].text) + '"';
		else if (e.isContentEditable) val = e.innerText.trim() ? ' text="' + clean(e.innerText).slice(0, 80) + '"' : " (empty)";
		if (type === "checkbox" || type === "radio" || role === "checkbox" || role === "switch") val += (e.checked || e.getAttribute("aria-checked") === "true") ? " [checked]" : " [not checked]";
		if (e.disabled || e.getAttribute("aria-disabled") === "true") val += " [disabled]";
		const line = label.slice(0, 90) + val + (tag === "a" && e.href && !/^javascript:/.test(e.getAttribute("href") || "") ? " → " + e.href.slice(0, 90) : "");
		if (!has(line + " " + kind)) continue;
		n++; e.setAttribute("data-mesai", String(n));
		const off = r.bottom < 0 || r.top > innerHeight ? " (off screen)" : "";
		els.push("[" + n + "] " + kind + ' "' + line + '"' + off);
		if (n >= 300) break;
	}
	let text = (document.body && document.body.innerText || "").split("\n").map(clean).filter(Boolean);
	if (words.length) text = text.filter(has);
	text = text.join("\n");
	const cut = text.length > max;
	const frames = document.querySelectorAll("iframe").length;
	return { url: location.href, title: document.title, scroll: Math.round(scrollY) + " of " + Math.max(0, document.documentElement.scrollHeight - innerHeight) + " px", text: text.slice(0, max) + (cut ? "\n…(" + (text.length - max) + " more characters: scroll, or read_page with find)" : ""), elements: els, frames: frames || undefined };
}
function pageLabel(ref) {
	const e = document.querySelector('[data-mesai="' + ref + '"]'); if (!e) return { label: "" };
	return { label: String(e.getAttribute("aria-label") || e.innerText || e.value || e.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 100) };
}
function pageClick(ref) {
	const e = document.querySelector('[data-mesai="' + ref + '"]');
	if (!e) return { error: "Element [" + ref + "] is not on the page any more: read_page again." };
	e.scrollIntoView({ block: "center", inline: "center" });
	const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, o = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
	try { e.dispatchEvent(new PointerEvent("pointerdown", o)); } catch (x2) {}
	e.dispatchEvent(new MouseEvent("mousedown", o));
	try { e.dispatchEvent(new PointerEvent("pointerup", o)); } catch (x2) {}
	e.dispatchEvent(new MouseEvent("mouseup", o));
	if (typeof e.focus === "function") e.focus({ preventScroll: true });
	e.click();
	return { clicked: ref, label: String(e.getAttribute("aria-label") || e.innerText || e.value || "").replace(/\s+/g, " ").trim().slice(0, 80) };
}
function pageType(ref, text, append, enter) {
	const e = document.querySelector('[data-mesai="' + ref + '"]');
	if (!e) return { error: "Element [" + ref + "] is not on the page any more: read_page again." };
	const ac = (e.getAttribute("autocomplete") || "").toLowerCase();
	if ((e.type || "").toLowerCase() === "password" || /cc-|one-time-code|current-password|new-password/.test(ac)) return { error: "This is a password / card / code field: the person must type it themselves." };
	e.scrollIntoView({ block: "center" }); e.focus();
	if (e.isContentEditable) {
		if (!append) { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents(e); s.removeAllRanges(); s.addRange(rg); }
		else { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents(e); rg.collapse(false); s.removeAllRanges(); s.addRange(rg); }
		if (!document.execCommand("insertText", false, text)) { if (!append) e.textContent = ""; e.textContent += text; e.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" })); }
	} else if ("value" in e) {
		const proto = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : e.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
		const set = Object.getOwnPropertyDescriptor(proto, "value").set;
		set.call(e, (append ? e.value : "") + text);
		e.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
		e.dispatchEvent(new Event("change", { bubbles: true }));
	} else return { error: "Element [" + ref + "] is not a text field." };
	if (enter) {
		const o = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
		const ok = e.dispatchEvent(new KeyboardEvent("keydown", o));
		e.dispatchEvent(new KeyboardEvent("keypress", o)); e.dispatchEvent(new KeyboardEvent("keyup", o));
		if (ok && e.form && e.tagName === "INPUT") { try { e.form.requestSubmit(); } catch (x) { e.form.submit(); } }
	}
	return { typed: text.length, into: ref };
}
function pageSelect(ref, option) {
	const e = document.querySelector('[data-mesai="' + ref + '"]');
	if (!e || e.tagName !== "SELECT") return { error: "Element [" + ref + "] is not a drop-down list: click it instead." };
	const want = option.trim().toLowerCase();
	const o = [].find.call(e.options, (x) => x.text.trim().toLowerCase() === want || x.value.toLowerCase() === want) || [].find.call(e.options, (x) => x.text.toLowerCase().indexOf(want) >= 0);
	if (!o) return { error: "No option \"" + option + "\". Options: " + [].map.call(e.options, (x) => x.text.trim()).slice(0, 40).join(" | ") };
	e.value = o.value; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
	return { chosen: o.text.trim() };
}
function pageScroll(dir, ref) {
	if (ref != null) { const e = document.querySelector('[data-mesai="' + ref + '"]'); if (!e) return { error: "Element [" + ref + "] is not on the page any more." }; e.scrollIntoView({ block: "center" }); }
	else if (dir === "top") scrollTo(0, 0);
	else if (dir === "bottom") scrollTo(0, document.documentElement.scrollHeight);
	else scrollBy(0, (dir === "up" ? -1 : 1) * innerHeight * 0.8);
	return { scroll: Math.round(scrollY) + " of " + Math.max(0, document.documentElement.scrollHeight - innerHeight) + " px" };
}
function pageKey(key) {
	const e = document.activeElement || document.body;
	const codes = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, Space: 32 };
	const k = key === "Space" ? " " : key, o = { key: k, code: key, keyCode: codes[key] || 0, which: codes[key] || 0, bubbles: true, cancelable: true };
	const ok = e.dispatchEvent(new KeyboardEvent("keydown", o));
	e.dispatchEvent(new KeyboardEvent("keyup", o));
	if (ok && key === "Enter" && e.form && e.tagName === "INPUT") { try { e.form.requestSubmit(); } catch (x) {} }
	return { pressed: key };
}
function pageBanner(on) {
	let b = document.querySelector("[data-mesai-banner]");
	if (!on) { if (b) b.remove(); return { ok: true }; }
	if (b) return { ok: true };
	b = document.createElement("div"); b.setAttribute("data-mesai-banner", "");
	b.style.cssText = "position:fixed;z-index:2147483647;right:12px;bottom:12px;all:initial;position:fixed;z-index:2147483647;right:12px;bottom:12px";
	const sh = b.attachShadow({ mode: "closed" });
	sh.innerHTML = '<style>div{font:600 13px system-ui,sans-serif;background:#4f46e5;color:#fff;border-radius:999px;padding:7px 8px 7px 14px;box-shadow:0 4px 18px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center}button{font:inherit;border:0;border-radius:999px;background:#fff;color:#4f46e5;padding:4px 11px;cursor:pointer}</style><div>🧭 MES AI is working in this tab <button type="button">Stop</button></div>';
	sh.querySelector("button").addEventListener("click", () => { try { chrome.runtime.sendMessage({ fromBanner: "stop" }); } catch (e) {} b.remove(); });
	(document.body || document.documentElement).appendChild(b);
	return { ok: true };
}
