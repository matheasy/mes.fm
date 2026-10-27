/* MES Pronounce (mes.fm/pronounce): UI. Pure helpers are MESPron (lib.js) + the Speed Reader's SRLib (voices, voice-failure check).
   Dictionary = CMU Pronouncing Dictionary shards in /pronounce/data/<xx>.json (build_pronounce_data.py); recordings + extra IPA from
   dictionaryapi.dev (Wikimedia Commons audio). Settings + recent words: localStorage mes-pronounce:v1. */
(function () {
	"use strict";
	var P = window.MESPron, SR = window.SRLib;
	function $(id) { return document.getElementById(id); }
	var root = $("pr");
	if (!root || !P || !SR) return;
	var KEY = "mes-pronounce:v1", BADKEY = "mes-speedreader:badvoices";   // bad voices are shared with the Speed Reader (same device, same voices)
	var hasTTS = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
	var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;

	/* ---------- state ---------- */
	var DEF = { lang: "en", accent: "", voice: "", rate: 1, pitch: 1, vol: 1, rep: 1, gap: 800, recent: [], last: "" };
	var S = (function () { try { var o = JSON.parse(localStorage.getItem(KEY) || "{}"); return Object.assign({}, DEF, o && typeof o === "object" ? o : {}); } catch (e) { return Object.assign({}, DEF); } })();
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var bad = (function () { try { return SR.pruneBadVoices(JSON.parse(localStorage.getItem(BADKEY) || "{}"), Date.now()); } catch (e) { return {}; } })();
	function saveBad() { try { localStorage.setItem(BADKEY, JSON.stringify(bad)); } catch (e) {} }
	var Q = P.parseQuery(location.search);
	if (Q.accent) S.accent = Q.accent;
	if (Q.rate) S.rate = Q.rate;

	var cur = { text: "", single: true, word: "", forms: [], fi: 0, est: false, toks: [], wordData: [], api: null };
	var loop = false;

	function toast(msg) { var t = $("pr-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function copy(text) {
		var ok = function () { toast("Copied"); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) { toast("Could not copy"); } ta.remove(); }
	}

	/* ---------- dictionary ---------- */
	var shards = {};
	function shard(w) {
		var k = P.shardOf(w);
		if (!shards[k]) shards[k] = fetch(P.shardUrl(w)).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { delete shards[k]; return {}; });
		return shards[k];
	}
	function entryFor(word) {
		var k = P.normWord(word);
		if (!k || !/[a-z]/.test(k)) return Promise.resolve(null);
		return shard(k).then(function (d) {
			if (d[k]) return d[k];
			var k2 = k.replace(/^'+|'+$/g, "");
			if (k2 !== k && k2) return entryFor(k2);
			var fb = P.fallbacks(k), i = 0;
			function next() {
				if (i >= fb.length) return null;
				var f = fb[i++];
				if (Array.isArray(f[0])) {     // a hyphenated word: join the parts
					return Promise.all(f[0].map(entryFor)).then(function (es) { return es.every(Boolean) ? es.map(function (e) { return e.split("|")[0]; }).join(" ") : next(); });
				}
				return shard(f[0]).then(function (d2) { var e = d2[f[0]]; return e ? e.split("|").map(function (p) { return f[1] ? p + " " + f[1] : p; }).join("|") : next(); });
			}
			return next();
		});
	}
	var apiCache = {};
	function dictApi(word) {
		var w = P.normWord(word);
		if (!/^[a-z][a-z' -]{0,40}$/.test(w)) return Promise.resolve(null);
		if (apiCache[w]) return apiCache[w];
		try { var c = sessionStorage.getItem("mes-pron:api:" + w); if (c) return (apiCache[w] = Promise.resolve(JSON.parse(c))); } catch (e) {}
		var url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(w);
		// the service sometimes answers 400 (without CORS headers, so it looks like a network error): try once more
		function get(n) { return fetch(url).then(function (r) { if (r.status === 404) return []; if (!r.ok) throw new Error("http " + r.status); return r.json(); }).catch(function (e) { if (n) return new Promise(function (res) { setTimeout(res, 1200); }).then(function () { return get(n - 1); }); throw e; }); }
		apiCache[w] = get(2).then(function (r) { return r; })
			.then(function (j) { var p = P.parseDictApi(j); try { sessionStorage.setItem("mes-pron:api:" + w, JSON.stringify(p)); } catch (e) {} return p; })
			.catch(function () { delete apiCache[w]; return null; });
		return apiCache[w];
	}

	/* ---------- voices ---------- */
	var voices = [], dn = null;
	try { dn = new Intl.DisplayNames(["en"], { type: "language" }); } catch (e) {}
	function langName(code) { try { return dn ? dn.of(code) : code; } catch (e) { return code; } }
	function vLang(v) { return String(v.lang || "").replace("_", "-"); }
	function vBase(v) { return vLang(v).split("-")[0].toLowerCase(); }
	function vAccent(v) { return vBase(v) === "en" ? P.accentOf(v.lang, v.name) : vLang(v).toLowerCase(); }
	function accentName(id) {
		if (S.lang === "en") return P.accentLabel(id);
		var reg = id.split("-")[1];
		if (!reg) return langName(id);
		try { return new Intl.DisplayNames(["en"], { type: "region" }).of(reg.toUpperCase()); } catch (e) { return id; }
	}
	function langVoices() { return voices.filter(function (v) { return vBase(v) === S.lang && !P.isNovelty(v.name); }); }
	function byKey(k) { for (var i = 0; i < voices.length; i++) if (SR.voiceKey(voices[i]) === k) return voices[i]; return null; }
	function voicesOf(acc) { return langVoices().filter(function (v) { return vAccent(v) === acc; }); }
	function bestIn(list, lang) { return SR.pickVoice(list, lang || S.lang, navigator.language, bad) || list[0] || null; }
	function accentDefault() {
		var nav = String(navigator.language || "en-US");
		if (S.lang === "en") { var a = P.accentOf(nav, ""); return a && a !== "en" && voicesOf(a).length ? a : (voicesOf("us").length ? "us" : (langVoices()[0] ? vAccent(langVoices()[0]) : "us")); }
		var l = langVoices(); return l.length ? vAccent(bestIn(l)) : "";
	}
	function voice() {
		var v = byKey(S.voice);
		if (v && vBase(v) === S.lang && !bad[SR.voiceKey(v)]) return v;   // a voice picked by hand (novelty ones too)
		var list = voicesOf(S.accent).filter(function (x) { return !bad[SR.voiceKey(x)]; });
		v = bestIn(list.length ? list : langVoices().filter(function (x) { return !bad[SR.voiceKey(x)]; }));
		return v || null;
	}
	function voiceFor(acc) {
		if (!acc) return voice();
		var list = voicesOf(acc).filter(function (x) { return !bad[SR.voiceKey(x)]; });
		return list.length ? bestIn(list) : null;
	}
	function loadVoices() {
		try { voices = (speechSynthesis.getVoices() || []).filter(function (v) { return v && v.lang; }); } catch (e) { voices = []; }
		buildLangs();
		if (!S.accent || !voicesOf(S.accent).length) S.accent = accentDefault();
		buildAccents(); buildVoiceSel(); buildCmpAcc();
	}
	function buildLangs() {
		var sel = $("pr-langsel"), seen = { en: 1 }, list = [];
		voices.forEach(function (v) { var b = vBase(v); if (!seen[b]) { seen[b] = 1; list.push(b); } });
		list.sort(function (a, b) { return langName(a).localeCompare(langName(b)); });
		sel.innerHTML = '<option value="en">English (syllables, IPA, respelling)</option>' + list.map(function (b) { return '<option value="' + esc(b) + '">' + esc(langName(b)) + " (voice only)</option>"; }).join("");
		if (S.lang !== "en" && !seen[S.lang]) S.lang = "en";
		sel.value = S.lang;
	}
	function buildAccents() {
		var box = $("pr-accents"), ids = [], seen = {};
		if (S.lang === "en") P.ACCENTS.concat([["en"]]).forEach(function (a) { if (voicesOf(a[0]).length) ids.push(a[0]); });
		else langVoices().forEach(function (v) { var a = vAccent(v); if (!seen[a]) { seen[a] = 1; ids.push(a); } });
		box.innerHTML = ids.map(function (id) {
			return '<button type="button" class="tu-chip" data-acc="' + esc(id) + '" aria-pressed="' + (id === S.accent) + '">' + esc(accentName(id)) + ' <span class="pr-n">' + voicesOf(id).length + "</span></button>";
		}).join("");
		var note = $("pr-anote");
		if (!hasTTS) note.textContent = "This browser cannot speak (no speech synthesis). The syllables, IPA and recordings still work.";
		else if (!voices.length) note.textContent = "Waiting for the voices of this device…";
		else if (S.lang === "en") {
			var missing = ["us", "uk", "au", "in"].filter(function (a) { return !voicesOf(a).length; }).map(P.accentLabel);
			note.textContent = ids.length + " English accent" + (ids.length === 1 ? "" : "s") + " on this device." + (missing.length ? " Not on this device: " + missing.join(", ") + " (other devices and browsers have other voices; Edge and Chrome have many)." : "");
		} else note.textContent = langVoices().length + " " + langName(S.lang) + " voice" + (langVoices().length === 1 ? "" : "s") + " on this device. Syllables and IPA are only shown for English.";
	}
	function voiceLabel(v) { return v.name.replace(/^(Microsoft|Google)\s+/, "") + " · " + vLang(v) + (v.localService ? "" : " · online") + (bad[SR.voiceKey(v)] ? " · ⚠ didn't speak here" : ""); }
	function buildVoiceSel() {
		var sel = $("pr-voice");
		if (!voices.length) { sel.innerHTML = '<option value="">' + (hasTTS ? "No voices yet" : "No voices in this browser") + "</option>"; return; }
		var mine = voicesOf(S.accent), rest = langVoices().filter(function (v) { return mine.indexOf(v) < 0; }), others = voices.filter(function (v) { return vBase(v) !== S.lang && !P.isNovelty(v.name); });
		function opts(list) { return list.map(function (v) { return '<option value="' + esc(SR.voiceKey(v)) + '">' + esc(voiceLabel(v)) + "</option>"; }).join(""); }
		var html = '<option value="">Automatic (best ' + esc(accentName(S.accent) || langName(S.lang)) + " voice)</option>";
		if (mine.length) html += '<optgroup label="' + esc(accentName(S.accent)) + '">' + opts(mine) + "</optgroup>";
		if (rest.length) html += '<optgroup label="Other ' + esc(langName(S.lang)) + ' accents">' + opts(rest) + "</optgroup>";
		var fun = voices.filter(function (v) { return vBase(v) === S.lang && P.isNovelty(v.name); });
		if (others.length) html += '<optgroup label="Other languages">' + opts(others) + "</optgroup>";
		if (fun.length) html += '<optgroup label="Novelty voices">' + opts(fun) + "</optgroup>";
		sel.innerHTML = html;
		sel.value = byKey(S.voice) ? S.voice : "";
	}
	function setAccent(id, quiet) {
		S.accent = id; S.voice = ""; save();
		buildAccents(); buildVoiceSel();
		if (cur.single && !cur.est && S.lang === "en") {   // show the matching form (UK forms for British-type accents)
			var uk = P.accentIsUk(id), i = cur.forms.findIndex(function (f) { return f.uk === uk; });
			if (i >= 0 && cur.forms[cur.fi].uk !== uk) { cur.fi = i; renderWord(); }
		}
		if (!quiet) { var v = voice(); if (v) setNote("Voice: " + v.name + " (" + vLang(v) + ")."); }
	}

	/* ---------- speaking ---------- */
	var keep = [], run = 0, switches = 0;
	function setNote(t) { $("pr-vnote").textContent = t || ""; }
	function sleep(ms, my) { return new Promise(function (r) { setTimeout(function () { r(my === run); }, ms); }); }
	function speakOne(text, o) {
		o = o || {};
		return new Promise(function (resolve) {
			if (!hasTTS) return resolve({ why: "notts" });
			var v = o.voice !== undefined ? o.voice : voice();
			var u = new SpeechSynthesisUtterance(text);
			if (v) { u.voice = v; u.lang = v.lang; } else u.lang = S.lang === "en" ? "en-US" : S.lang;
			u.rate = Math.max(0.1, Math.min(10, o.rate || S.rate)); u.pitch = S.pitch; u.volume = S.vol;
			var started = false, t0 = 0, gotB = false, done = false, words = (String(text).match(/\S+/g) || []).length;
			u.onstart = function () { started = true; t0 = performance.now(); if (o.onstart) o.onstart(); };
			u.onboundary = function (e) { gotB = true; if (o.onboundary) o.onboundary(e); };
			u.onend = function () { finish(""); };
			u.onerror = function (e) { finish(e && e.error || "error"); };
			var wd = setTimeout(function () { if (!started && !done) { done = true; try { speechSynthesis.cancel(); } catch (e) {} end({ why: "nostart", voice: v }); } }, 4500);
			function finish(err) {
				if (done) return; done = true;
				var why = SR.speechFailure(err ? { error: err, started: started } : { started: started, ms: started ? performance.now() - t0 : 0, expectMs: words * 400 / u.rate, words: words, boundary: gotB });
				end({ why: why, err: err, voice: v });
			}
			function end(r) { clearTimeout(wd); var i = keep.indexOf(u); if (i >= 0) keep.splice(i, 1); resolve(r); }
			keep.push(u);
			try { speechSynthesis.speak(u); if (speechSynthesis.paused) speechSynthesis.resume(); } catch (e) { finish("error"); }
		});
	}
	// speak with voice-failure handling: a voice that makes no sound is remembered and replaced (up to 4 switches per play)
	function say(text, o, my) {
		o = o || {};
		return speakOne(text, o).then(function (r) {
			if (my !== run) return false;
			if (r.why && r.why !== "notts" && r.voice && switches < 4) {
				var k = SR.voiceKey(r.voice);
				bad[k] = { t: Date.now(), lang: vLang(r.voice) }; saveBad();
				switches++;
				var acc = vAccent(r.voice), nv = voiceFor(acc) || voice();
				if (S.voice === k) S.voice = "";
				buildVoiceSel();
				if (nv && SR.voiceKey(nv) !== k) {
					setNote("The voice " + r.voice.name + " did not make a sound here, so it was switched to " + nv.name + ".");
					var o2 = Object.assign({}, o, { voice: nv });
					return say(text, o2, my);
				}
				setNote("The voice " + r.voice.name + " did not make a sound here. Try another voice from the list.");
				return false;
			}
			if (r.why === "notts") setNote("This browser has no speech voices. Try the recordings below, or another browser.");
			return true;
		});
	}
	function stop() {
		run++; loop = loop;   // keep the Loop setting
		try { if (hasTTS) speechSynthesis.cancel(); } catch (e) {}
		try { au.pause(); } catch (e) {}
		busy(false); hl(-1);
	}
	function busy(on) { $("pr-stop").disabled = !on; root.classList.toggle("pr-busy", !!on); }
	function hl(i, kind) {
		var boxes = $("pr-syls").children;
		for (var k = 0; k < boxes.length; k++) boxes[k].classList.toggle("is-on", kind === "all" || k === i && kind !== "word");
		var wc = $("pr-sent").querySelectorAll(".pr-wc");
		for (var j = 0; j < wc.length; j++) wc[j].classList.toggle("is-on", kind === "word" && +wc[j].dataset.t === i || kind === "all");
	}
	function speechText() { return cur.text; }
	function play(mode) {
		if (!cur.text) return;
		stop();
		var my = ++run; switches = 0; busy(true);
		var reps = loop ? 1e9 : S.rep, r = 0;
		function once() {
			if (mode === "syl") return bySyllable(my);
			if (mode === "word") return byWord(my);
			return whole(mode === "slow" ? S.rate * 0.55 : S.rate, my);
		}
		function step() {
			if (my !== run) return;
			if (r >= reps) { busy(false); hl(-1); return; }
			(r++ ? sleep(S.gap, my) : Promise.resolve(true)).then(function (ok) { if (!ok) return; return once(); }).then(function () { if (my === run) step(); });
		}
		step();
	}
	function whole(rate, my) {
		var toks = cur.toks, gotB = false, fall = null;
		hl(-1, cur.single ? "all" : "");
		return say(speechText(), {
			rate: rate,
			onstart: function () {
				if (cur.single) { hl(-1, "all"); return; }
				// voices without word-boundary events: move the highlight by an estimate
				var words = toks.filter(function (t) { return t.word; }), i = 0, per = 60000 / 165 / rate;
				fall = setTimeout(function tick() { if (gotB || my !== run || i >= words.length) return; hl(words.indexOf(words[i]) >= 0 ? toks.indexOf(words[i]) : -1, "word"); fall = setTimeout(tick, per * Math.max(0.6, P.estimateSyllables(words[i].w) * 0.55)); i++; }, 60);
			},
			onboundary: function (e) {
				if (cur.single) return;
				gotB = true; clearTimeout(fall);
				var ci = e.charIndex || 0;
				for (var i = 0; i < toks.length; i++) if (toks[i].word && ci >= toks[i].s && ci < toks[i].e + 1) { hl(i, "word"); break; }
			}
		}, my).then(function () { clearTimeout(fall); if (my === run) hl(-1); });
	}
	function bySyllable(my) {
		var parts = sylTexts(), i = 0;
		function next() {
			if (my !== run) return Promise.resolve();
			if (i >= parts.length) { hl(-1, "all"); return sleep(350, my).then(function (ok) { return ok && say(speechText(), { rate: S.rate * 0.8 }, my); }).then(function () { if (my === run) hl(-1); }); }
			var k = i++; hl(k, "syl");
			return say(parts[k], { rate: S.rate * 0.75 }, my).then(function (ok) { return ok && sleep(260, my); }).then(function (ok) { return ok ? next() : null; });
		}
		return next();
	}
	function byWord(my) {
		var ws = cur.toks.map(function (t, i) { return [t, i]; }).filter(function (x) { return x[0].word; }), i = 0;
		function next() {
			if (my !== run || i >= ws.length) { hl(-1); return Promise.resolve(); }
			var x = ws[i++]; hl(x[1], "word");
			return say(x[0].w, { rate: S.rate * 0.85 }, my).then(function (ok) { return ok && sleep(Math.min(S.gap, 500), my); }).then(function (ok) { return ok ? next() : null; });
		}
		return next();
	}
	// what to say for each syllable: the respelling (lower case, so voices do not spell capitals out letter by letter)
	function sylTexts() {
		if (cur.est || !cur.forms.length) return P.spellingBreaks(cur.word, P.estimateSyllables(cur.word));
		return cur.forms[cur.fi].respell.map(function (x) { return x.toLowerCase().replace(/-/g, ""); });
	}

	/* ---------- recordings ---------- */
	var au = new Audio(), resolved = {};
	au.preload = "none";
	function commons(item) {
		if (!item.curid) return Promise.resolve("");
		if (resolved[item.curid]) return Promise.resolve(resolved[item.curid]);
		return fetch("https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&pageids=" + encodeURIComponent(item.curid))
			.then(function (r) { return r.json(); }).then(function (j) {
				var pg = j && j.query && j.query.pages && j.query.pages[item.curid], u = pg && pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].url;
				return (resolved[item.curid] = P.commonsMp3(u) || "");
			}).catch(function () { return ""; });
	}
	function playRec(item, btn) {
		stop();
		var my = run;
		au.volume = S.vol; au.playbackRate = Math.max(0.5, Math.min(2, S.rate));
		function tryUrl(u, last) {
			au.onerror = function () { if (my !== run) return; if (!last) commons(item).then(function (c) { if (c && my === run) tryUrl(c, true); else fail(); }); else fail(); };
			au.onended = function () { btn && btn.classList.remove("is-on"); busy(false); };
			au.src = u;
			btn && btn.classList.add("is-on"); busy(true);
			au.play().catch(function (e) { if (e && e.name === "NotAllowedError") { btn && btn.classList.remove("is-on"); busy(false); } });
		}
		function fail() { btn && btn.classList.remove("is-on"); busy(false); toast("That recording could not be played"); }
		tryUrl(item.url, !item.curid);
	}
	function renderApi(api, word) {
		var card = $("pr-reccard");
		if (!api || (!api.audio.length && !api.ipas.length && !api.meanings.length)) { card.hidden = true; return; }
		card.hidden = false;
		$("pr-reclist").innerHTML = api.audio.length ? api.audio.map(function (a, i) {
			return '<div class="pr-recitem"><button type="button" class="tu-btn pr-recbtn" data-rec="' + i + '">&#9654;&#65038; ' + esc(a.label) + "</button>" +
				(a.ipa ? '<span class="pr-recipa">' + esc(a.ipa) + "</span>" : "") +
				'<span class="pr-reclic">' + (a.license ? (a.licenseUrl ? '<a href="' + esc(a.licenseUrl) + '" target="_blank" rel="noopener">' + esc(a.license) + "</a>" : esc(a.license)) : "") +
				(a.source ? ' · <a href="' + esc(a.source) + '" target="_blank" rel="noopener">source</a>' : "") + "</span></div>";
		}).join("") : '<p class="tu-note">No recording of a real person for this word.</p>';
		$("pr-ipas").innerHTML = api.ipas.length ? '<p class="pr-ipasl"><b>Other transcriptions:</b> ' + api.ipas.map(function (x) { return '<span class="pr-ipa2">' + esc(x.ipa) + (x.accent ? " <i>" + esc(P.AUDIO_LABEL[x.accent] || x.accent) + "</i>" : "") + "</span>"; }).join(" ") + "</p>" : "";
		$("pr-mean").innerHTML = api.meanings.length ? '<p class="pr-meanh"><b>Meaning</b> (to tell apart words that sound alike):</p><ul>' + api.meanings.map(function (m) { return "<li><i>" + esc(m.pos) + "</i> " + esc(m.defs[0]) + "</li>"; }).join("") + "</ul>" : "";
		card._api = api;
	}

	/* ---------- showing a word or a sentence ---------- */
	var showSeq = 0;
	function show(text, opts) {
		opts = opts || {};
		text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
		if (!text) return Promise.resolve();
		var my = ++showSeq;
		cur.text = text;
		cur.toks = P.tokens(text);
		var words = cur.toks.filter(function (t) { return t.word; });
		cur.single = words.length <= 1;
		cur.word = words.length ? words[0].w : text;
		$("pr-word").textContent = text;
		$("pr-word").classList.toggle("pr-word--long", text.length > 18);
		$("pr-byword").hidden = cur.single; $("pr-bysyl").hidden = !cur.single || S.lang !== "en";
		if (!opts.noUrl) { try { history.replaceState(null, "", location.pathname + "?" + P.buildQuery({ q: text })); } catch (e) {} }
		S.last = text; save();
		if (S.lang !== "en") { renderForeign(); return Promise.resolve(); }
		if (cur.single) {
			return entryFor(cur.word).then(function (entry) {
				if (my !== showSeq) return;
				cur.forms = P.forms(cur.word, entry);
				cur.est = !cur.forms.length; cur.api = null;
				var uk = P.accentIsUk(S.accent), i = cur.forms.findIndex(function (f) { return f.label === "Usual"; });
				if (i < 0) i = cur.forms.findIndex(function (f) { return f.uk === uk; });
				cur.fi = Math.max(0, i);
				renderWord();
				$("pr-reccard").hidden = true;
				// ask dictionaryapi.dev only once the word has settled (it answers 400 to bursts while someone is typing)
				setTimeout(function () { if (my === showSeq) dictApi(cur.word).then(function (api) { if (my !== showSeq) return; cur.api = api; renderApi(api, cur.word); if (cur.est) renderWord(); }); }, opts.now ? 0 : 900);
			});
		}
		var uniq = words.map(function (t) { return t.key; });
		return Promise.all(uniq.map(entryFor)).then(function (entries) {
			if (my !== showSeq) return;
			cur.wordData = words.map(function (t, i) { var f = P.forms(t.w, entries[i]); return { t: t, forms: f }; });
			renderSentence();
			$("pr-reccard").hidden = true;
		});
	}
	function ord(n) { return n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"); }
	function renderWord() {
		$("pr-sent").hidden = true; $("pr-syls").hidden = false; $("pr-spellline").hidden = false; $("pr-soundcard").hidden = false;
		var tabs = $("pr-forms"), f = cur.forms[cur.fi], est = $("pr-est");
		tabs.innerHTML = cur.forms.length > 1 ? cur.forms.map(function (x, i) {
			return '<button type="button" role="tab" class="pr-ftab" data-fi="' + i + '" aria-selected="' + (i === cur.fi) + '">' + esc(x.label) + '<span class="pr-ftabi">' + esc(x.ipa) + "</span></button>";
		}).join("") : "";
		if (!f) {
			var n = P.estimateSyllables(cur.word), parts = P.spellingBreaks(cur.word, n);
			$("pr-syls").innerHTML = n ? parts.map(function (p, i) { return '<span class="pr-syl pr-s0" data-i="' + i + '"><b>' + esc(p) + "</b></span>"; }).join("") : "";
			var apiIpa = cur.api && cur.api.ipas.length ? cur.api.ipas.map(function (x) { return x.ipa + (x.accent ? " (" + (P.AUDIO_LABEL[x.accent] || x.accent) + ")" : ""); }).join(", ") : "";
			$("pr-resp").textContent = "—";
			$("pr-ipa").textContent = apiIpa || "not known";
			$("pr-count").textContent = n ? n + " (estimated from the spelling)" : "not a word the page knows (a number or a symbol?)";
			$("pr-spell").textContent = parts.join("·");
			$("pr-noteline").hidden = true;
			est.hidden = false;
			est.textContent = "“" + cur.word + "” is not in the dictionary, so the syllables are an estimate from the spelling" + (apiIpa ? " and the IPA comes from dictionaryapi.dev." : ". The voices can still say it.");
			$("pr-seq").innerHTML = '<p class="tu-note">Not known for this word.</p>';
			return;
		}
		est.hidden = true;
		var n1 = f.syls.length, si = f.stress.indexOf(1);
		$("pr-syls").innerHTML = f.syls.map(function (s, i) {
			return '<button type="button" class="pr-syl pr-s' + s.stress + '" data-i="' + i + '" title="' + (s.stress === 1 ? "Stressed syllable" : s.stress === 2 ? "Lighter stress" : "Unstressed") + ': press to hear it"><b>' + esc(f.respell[i]) + '</b><small>' + esc(P.syllableIpa(s, f.uk)) + "</small></button>";
		}).join("");
		$("pr-resp").innerHTML = f.respell.map(function (r, i) { return f.stress[i] === 1 && n1 > 1 ? "<strong>" + esc(r) + "</strong>" : esc(r); }).join("-");
		$("pr-ipa").textContent = f.ipa;
		$("pr-count").textContent = n1 + (n1 > 1 && si >= 0 ? " · stress on the " + ord(si + 1) : "") + "   " + f.stress.map(function (s) { return s === 1 ? "●" : s === 2 ? "•" : "·"; }).join(" ");
		$("pr-spell").textContent = P.spellingBreaks(cur.word, n1).join("·");
		$("pr-noteline").hidden = !f.note && !f.uk;
		$("pr-note").textContent = (f.uk ? "British (UK) pronunciation, written by hand. " : "") + (f.note || "");
		var sounds = P.soundsOf(f.phones, f.uk);
		$("pr-seq").innerHTML = f.phones.map(function (ph) {
			var p = ph.replace(/\d/g, ""), g = (P.GUIDE[p] || ["", "", ""]).slice(), exs = g[1].split(",");
			if (exs.length > 1) g[1] = (/0$/.test(ph) ? exs[1] : exs[0]).trim();   // ə as in about, ʌ as in cup
			return '<button type="button" class="pr-snd' + (P.isVowel(ph) ? " pr-snd--v" : "") + '" data-ex="' + esc(g[1].split(",")[0].replace(/\s*\(.*\)/, "").trim()) + '" title="as in ' + esc(g[1]) + '"><b>' + esc(P.phoneIpa(ph, f.uk)) + '</b><span>' + esc(g[2]) + '</span><i>' + esc(g[1].split(",")[0]) + "</i></button>";
		}).join("") + (sounds.length ? "" : "");
	}
	function renderSentence() {
		$("pr-forms").innerHTML = ""; $("pr-syls").hidden = true; $("pr-spellline").hidden = true; $("pr-est").hidden = true; $("pr-soundcard").hidden = true;
		var resp = [], ipa = [], nsyl = 0, unknown = 0;
		var uk = P.accentIsUk(S.accent);
		var html = cur.wordData.map(function (d, i) {
			var f = d.forms.find(function (x) { return x.uk === uk; }) || d.forms[0];
			var tIdx = cur.toks.indexOf(d.t);
			if (f) { resp.push(f.respell.join("-")); ipa.push(f.ipa.slice(1, -1)); nsyl += f.syls.length; }
			else { unknown++; var n = P.estimateSyllables(d.t.w); nsyl += n; resp.push(P.spellingBreaks(d.t.w, n).join("-")); ipa.push("?"); }
			return '<button type="button" class="pr-wc" data-t="' + tIdx + '" title="Open this word"><b>' + esc(d.t.w) + "</b><span>" + esc(f ? f.respell.join("-") : "?") + "</span><small>" + esc(f ? f.ipa : "not in the dictionary") + "</small></button>";
		}).join("");
		$("pr-sent").innerHTML = html + '<p class="tu-note pr-senth">Press a word to open it on its own.</p>';
		$("pr-sent").hidden = false;
		$("pr-resp").textContent = resp.join("  ");
		$("pr-ipa").textContent = "/" + ipa.join(" ") + "/";
		$("pr-count").textContent = nsyl + " in " + cur.wordData.length + " words" + (unknown ? " (" + unknown + " not in the dictionary: estimated)" : "");
		$("pr-noteline").hidden = true;
	}
	function renderForeign() {
		$("pr-forms").innerHTML = ""; $("pr-syls").hidden = true; $("pr-spellline").hidden = true; $("pr-soundcard").hidden = true; $("pr-reccard").hidden = true;
		var words = cur.toks.filter(function (t) { return t.word; });
		$("pr-sent").innerHTML = cur.single ? "" : words.map(function (t) { return '<button type="button" class="pr-wc" data-t="' + cur.toks.indexOf(t) + '" data-nopen="1"><b>' + esc(t.w) + "</b></button>"; }).join("");
		$("pr-sent").hidden = cur.single;
		$("pr-resp").textContent = "—"; $("pr-ipa").textContent = "only shown for English"; $("pr-count").textContent = "—"; $("pr-noteline").hidden = true;
		var e = $("pr-est"); e.hidden = false; e.textContent = langName(S.lang) + ": the voices read it; syllables and IPA are only worked out for English.";
	}
	function remember(text) {
		S.recent = P.addRecent(S.recent, text, 16); save(); renderRecent();
	}
	function renderRecent() {
		var row = $("pr-recentrow"), box = $("pr-recent");
		row.hidden = !S.recent.length;
		box.innerHTML = S.recent.map(function (w) { return '<button type="button" class="tu-chip" data-q="' + esc(w) + '">' + esc(w.length > 28 ? w.slice(0, 27) + "…" : w) + "</button>"; }).join("");
	}

	/* ---------- compare ---------- */
	var CMP_EX = [["tomato", "us", "tomato", "uk"], ["schedule", "us", "schedule", "uk"], ["either", "us", "either", "uk"], ["privacy", "us", "privacy", "uk"], ["water", "us", "water", "au"],
		["affect", "", "effect", ""], ["desert", "", "dessert", ""], ["quiet", "", "quite", ""], ["lose", "", "loose", ""], ["then", "", "than", ""], ["accept", "", "except", ""], ["live", "", "leave", ""]];
	function buildCmpAcc() {
		["pr-caa", "pr-cba"].forEach(function (id) {
			var sel = $(id), v = sel.value;
			var ids = P.ACCENTS.map(function (a) { return a[0]; }).filter(function (a) { return voicesOf(a).length; });
			sel.innerHTML = '<option value="">My accent</option>' + ids.map(function (a) { return '<option value="' + a + '">' + esc(P.accentLabel(a)) + "</option>"; }).join("");
			if (v) sel.value = v;
		});
	}
	function cmpSide(s) {
		var w = $(s === "a" ? "pr-ca" : "pr-cb").value.trim(), acc = $(s === "a" ? "pr-caa" : "pr-cba").value || S.accent, out = $(s === "a" ? "pr-cao" : "pr-cbo");
		if (!w) { out.innerHTML = ""; return Promise.resolve(); }
		return entryFor(w).then(function (e) {
			var fs = P.forms(w, e), uk = P.accentIsUk(acc), f = fs.find(function (x) { return x.uk === uk && x.label !== "Usual"; }) || fs[0];
			if (!f) { out.innerHTML = '<p class="pr-cw">' + esc(w) + '</p><p class="tu-note">Not in the dictionary.</p>'; return; }
			out.innerHTML = '<p class="pr-cw">' + esc(w) + '</p><div class="pr-csyl">' + f.respell.map(function (r, i) { return '<span class="pr-syl pr-s' + f.stress[i] + '"><b>' + esc(r) + "</b></span>"; }).join("") + '</div><p class="pr-cipa">' + esc(f.ipa) + " <i>" + esc(f.uk ? "UK form" : f.label) + "</i></p>";
		});
	}
	function cmpPlay(which) {
		stop();
		var my = ++run; switches = 0; busy(true);
		var seq = which === "both" ? ["a", "b"] : [which], i = 0, alt = $("pr-calt").getAttribute("aria-pressed") === "true";
		function next() {
			if (my !== run) return;
			if (i >= seq.length) { if (which === "both" && alt) { i = 0; return sleep(S.gap + 300, my).then(function (ok) { if (ok) next(); }); } busy(false); hl(-1); return; }
			var s = seq[i++], w = $(s === "a" ? "pr-ca" : "pr-cb").value.trim(), acc = $(s === "a" ? "pr-caa" : "pr-cba").value;
			var side = $(s === "a" ? "pr-sa" : "pr-sb");
			$("pr-sa").classList.toggle("is-on", s === "a"); $("pr-sb").classList.toggle("is-on", s === "b");
			if (!w) return next();
			var v = acc ? voiceFor(acc) : voice();
			if (acc && !v) setNote("No " + P.accentLabel(acc) + " voice on this device, so your own accent is used.");
			say(w, { voice: v || voice() }, my).then(function () { side.classList.remove("is-on"); return sleep(600, my); }).then(function (ok) { if (ok) next(); });
		}
		next();
	}

	/* ---------- practice (speech recognition) ---------- */
	var rec = null;
	function practice() {
		if (!Rec) return;
		if (rec) { try { rec.abort(); } catch (e) {} rec = null; $("pr-mic").classList.remove("is-on"); return; }
		stop();
		var v = voice(), r = new Rec();
		rec = r;
		r.lang = v ? vLang(v) : (S.lang === "en" ? "en-US" : S.lang);
		r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
		$("pr-mic").classList.add("is-on"); $("pr-pres").textContent = "Listening… say “" + cur.text + "”";
		$("pr-heard").innerHTML = "";
		r.onresult = function (e) {
			var res = e.results[0], alts = [];
			for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
			var m = P.heardMatch(cur.text, alts);
			$("pr-heard").innerHTML = alts.map(function (a, i) { return '<li class="' + (m.ok && i === m.i ? "is-ok" : "") + '">' + esc(a) + (res[i].confidence ? ' <small>' + Math.round(res[i].confidence * 100) + "%</small>" : "") + "</li>"; }).join("");
			if (m.ok) { $("pr-pres").innerHTML = '<b class="pr-ok">&#10003; Heard it right' + (m.i ? " (it was the browser's guess number " + (m.i + 1) + ")" : "") + ".</b>"; return; }
			$("pr-pres").innerHTML = "We heard “" + esc(alts[0] || "") + "”." + (m.score ? " " + Math.round(m.score * 100) + "% of the words match." : " Try again, a little slower.");
			if (cur.single && alts[0]) {      // same sounds, other spelling (a homophone) counts as right
				Promise.all([entryFor(cur.text), entryFor(alts[0])]).then(function (es) {
					if (!es[0] || !es[1]) return;
					var a = es[0].split("|").map(function (x) { return x.replace(/\d/g, ""); }), b = es[1].split("|").map(function (x) { return x.replace(/\d/g, ""); });
					if (a.some(function (x) { return b.indexOf(x) >= 0; })) $("pr-pres").innerHTML = '<b class="pr-ok">&#10003; That sounds right.</b> The browser wrote “' + esc(alts[0]) + "”, which sounds the same.";
				});
			}
		};
		r.onerror = function (e) {
			var m = { "not-allowed": "The microphone is blocked for this site. Allow it in the browser's address bar and try again.", "no-speech": "Nothing was heard. Press the microphone and speak a little louder.", "network": "The speech service could not be reached (it needs the internet).", "audio-capture": "No microphone was found." }[e.error];
			$("pr-pres").textContent = m || "Speech recognition stopped (" + e.error + ").";
		};
		r.onend = function () { rec = null; $("pr-mic").classList.remove("is-on"); if (/^Listening/.test($("pr-pres").textContent)) $("pr-pres").textContent = "Nothing was heard. Try again."; };
		try { r.start(); } catch (e) { rec = null; $("pr-mic").classList.remove("is-on"); $("pr-pres").textContent = "Could not start the microphone."; }
	}

	/* ---------- fill window / full screen ---------- */
	var stage = $("pr-stage");
	function setFill(on) {
		stage.classList.toggle("pr-fill", on); document.documentElement.classList.toggle("pr-fill-open", on);
		$("pr-fill").setAttribute("aria-pressed", String(on)); $("pr-fill").innerHTML = on ? "&#10005; Close" : "&#10530; Fill window";
	}
	function fullScreen() {
		if (document.fullscreenElement) { document.exitFullscreen(); return; }
		if (stage.requestFullscreen) stage.requestFullscreen().catch(function () { setFill(true); }); else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen(); else setFill(true);
	}
	document.addEventListener("fullscreenchange", function () { stage.classList.toggle("pr-fsmode", document.fullscreenElement === stage); });

	/* ---------- wiring ---------- */
	function go(text, speak) {
		$("pr-q").value = text;
		var p = show(text, { now: true });
		remember(text);
		if (speak) { if (hasTTS) play("normal"); }   // speak now, inside the click (the voice is set when the dictionary answers; speaking does not wait for it)
		return p;
	}
	$("pr-form").addEventListener("submit", function (e) { e.preventDefault(); var t = $("pr-q").value.trim(); if (t) go(t, true); });
	var deb;
	$("pr-q").addEventListener("input", function () { clearTimeout(deb); var t = this.value; deb = setTimeout(function () { if (t.trim()) show(t); }, 380); });
	root.addEventListener("click", function (e) {
		var t = e.target.closest("button, a"); if (!t || !root.contains(t)) return;
		if (t.dataset.q) { go(t.dataset.q, true); if (t.closest("#pr-cgrid")) stage.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
		if (t.dataset.acc) { setAccent(t.dataset.acc); return; }
		if (t.dataset.fi) { cur.fi = +t.dataset.fi; renderWord(); var f = cur.forms[cur.fi]; if (f && S.lang === "en") { var want = f.uk ? "uk" : "us"; if (P.accentIsUk(S.accent) !== f.uk && voicesOf(want).length) { setAccent(want, true); setNote("Switched to a " + P.accentLabel(want) + " voice for this form."); } } play("normal"); return; }
		if (t.classList.contains("pr-syl") && t.dataset.i !== undefined && t.closest("#pr-syls")) { var parts = sylTexts(), i = +t.dataset.i; stop(); var my = ++run; busy(true); hl(i, "syl"); say(parts[i], { rate: S.rate * 0.75 }, my).then(function () { if (my === run) { busy(false); hl(-1); } }); return; }
		if (t.classList.contains("pr-wc")) { if (t.dataset.nopen) return; var tok = cur.toks[+t.dataset.t]; if (tok) { var back = cur.text; go(tok.w, true); setNote("From the sentence: “" + back + "”"); } return; }
		if (t.classList.contains("pr-snd")) { stop(); var my2 = ++run; busy(true); say(t.dataset.ex, {}, my2).then(function () { if (my2 === run) busy(false); }); return; }
		if (t.dataset.rec !== undefined) { var api = $("pr-reccard")._api; if (api) playRec(api.audio[+t.dataset.rec], t); return; }
		if (t.dataset.cplay) { cmpPlay(t.dataset.cplay); return; }
		if (t.dataset.cmp) { var ex = CMP_EX[+t.dataset.cmp]; $("pr-ca").value = ex[0]; $("pr-cb").value = ex[2]; setSel("pr-caa", ex[1]); setSel("pr-cba", ex[3]); cmpSide("a"); cmpSide("b"); cmpPlay("both"); return; }
		if (t.dataset.kex) { stop(); var my3 = ++run; busy(true); say(t.dataset.kex, {}, my3).then(function () { if (my3 === run) busy(false); }); return; }
	});
	function setSel(id, v) { var s = $(id); s.value = v; if (s.value !== v) s.value = ""; }
	$("pr-play").addEventListener("click", function () { play("normal"); });
	$("pr-slow").addEventListener("click", function () { play("slow"); });
	$("pr-bysyl").addEventListener("click", function () { play("syl"); });
	$("pr-byword").addEventListener("click", function () { play("word"); });
	$("pr-stop").addEventListener("click", stop);
	$("pr-loop").addEventListener("click", function () { loop = !loop; this.setAttribute("aria-pressed", String(loop)); });
	$("pr-fill").addEventListener("click", function () { setFill(!stage.classList.contains("pr-fill")); });
	$("pr-fs").addEventListener("click", fullScreen);
	$("pr-share").addEventListener("click", function () { copy(location.origin + "/pronounce?" + P.buildQuery({ q: cur.text, accent: S.accent && S.lang === "en" ? S.accent : "" })); });
	$("pr-ipacopy").addEventListener("click", function () { copy($("pr-ipa").textContent); });
	$("pr-recentclr").addEventListener("click", function () { S.recent = []; save(); renderRecent(); });
	$("pr-langsel").addEventListener("change", function () { S.lang = this.value; S.voice = ""; S.accent = ""; save(); loadVoices(); show(cur.text, { noUrl: true }); });
	$("pr-voice").addEventListener("change", function () {
		S.voice = this.value; var v = byKey(S.voice);
		if (v) { if (vBase(v) !== S.lang) { S.lang = vBase(v); buildLangs(); } S.accent = vAccent(v); }
		save(); buildAccents(); if (v) setNote("Voice: " + v.name + " (" + vLang(v) + ")."); show(cur.text, { noUrl: true });
	});
	function slider(id, key, fmt) {
		var el = $(id), out = $(id + "-o");
		el.value = S[key]; out.textContent = fmt(+el.value);
		el.addEventListener("input", function () { S[key] = +el.value; out.textContent = fmt(S[key]); save(); });
	}
	slider("pr-rate", "rate", function (v) { return v.toFixed(2).replace(/0$/, "") + "×"; });
	slider("pr-pitch", "pitch", function (v) { return v.toFixed(2).replace(/0$/, ""); });
	slider("pr-vol", "vol", function (v) { return Math.round(v * 100) + "%"; });
	$("pr-rep").value = String(S.rep); $("pr-rep").addEventListener("change", function () { S.rep = +this.value || 1; save(); });
	$("pr-gap").value = String(S.gap); if (!$("pr-gap").value) $("pr-gap").value = "800";
	$("pr-gap").addEventListener("change", function () { S.gap = +this.value || 800; save(); });
	$("pr-vreset").addEventListener("click", function () { S.rate = 1; S.pitch = 1; S.vol = 1; save(); ["pr-rate", "pr-pitch", "pr-vol"].forEach(function (id) { var el = $(id); el.value = 1; el.dispatchEvent(new Event("input")); }); });
	$("pr-ca").addEventListener("input", function () { cmpSide("a"); });
	$("pr-cb").addEventListener("input", function () { cmpSide("b"); });
	$("pr-caa").addEventListener("change", function () { cmpSide("a"); });
	$("pr-cba").addEventListener("change", function () { cmpSide("b"); });
	$("pr-cboth").addEventListener("click", function () { cmpPlay("both"); });
	$("pr-calt").addEventListener("click", function () { var on = this.getAttribute("aria-pressed") !== "true"; this.setAttribute("aria-pressed", String(on)); });
	if (Rec) $("pr-mic").addEventListener("click", practice);
	else { $("pr-mic").disabled = true; $("pr-pnote").textContent = "This browser has no speech recognition. Chrome, Edge and Safari have it (on a computer or a phone)."; }
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape") { if (stage.classList.contains("pr-fill")) { setFill(false); return; } stop(); return; }
		var tg = e.target, typing = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable);
		if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === " " && !(tg && tg.tagName === "BUTTON")) { e.preventDefault(); play("normal"); }
		else if (e.key === "l" || e.key === "L") $("pr-loop").click();
		else if (e.key === "w" || e.key === "W") $("pr-fill").click();
		else if (e.key === "f" || e.key === "F") fullScreen();
	});

	/* ---------- static lists ---------- */
	var EX = ["pronunciation", "tomato", "schedule", "worcestershire", "quinoa", "colonel", "either", "record", "read", "Wednesday", "How are you today?"];
	$("pr-ex").innerHTML = EX.map(function (w) { return '<button type="button" class="tu-chip" data-q="' + esc(w) + '">' + esc(w) + "</button>"; }).join("");
	$("pr-cmpex").innerHTML = CMP_EX.map(function (x, i) { return '<button type="button" class="tu-chip" data-cmp="' + i + '">' + esc(x[0] === x[2] ? x[0] + ": " + P.accentLabel(x[1]) + " / " + P.accentLabel(x[3]) : x[0] + " / " + x[2]) + "</button>"; }).join("");
	$("pr-cgrid").innerHTML = P.COMMON.map(function (c) { return '<button type="button" class="pr-cw2" data-q="' + esc(c[0]) + '"><b>' + esc(c[0]) + "</b><span>" + esc(c[1]) + "</span></button>"; }).join("");
	var keyRows = Object.keys(P.GUIDE).map(function (p) { var g = P.GUIDE[p]; return "<tr><td class=\"pr-kipa\">" + esc(g[0]) + "</td><td>" + esc(g[2]) + "</td><td>" + esc(g[1]) + '</td><td><button type="button" class="pr-mini" data-kex="' + esc(g[1].split(",")[0].replace(/\s*\(.*\)/, "").trim()) + '" aria-label="Hear ' + esc(g[1]) + '">&#9654;&#65038;</button></td></tr>'; });
	$("pr-key").querySelector("tbody").innerHTML = keyRows.join("");
	renderRecent();

	/* ---------- start ---------- */
	if (hasTTS) {
		loadVoices();
		try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch (e) { speechSynthesis.onvoiceschanged = loadVoices; }
		var tries = 0, iv = setInterval(function () { if (voices.length || ++tries > 20) clearInterval(iv); if (!voices.length) loadVoices(); }, 250);
	} else loadVoices();
	if (window.MESVoicePicker) MESVoicePicker.enhance($("pr-voice"), { sample: "Hello, this is how I sound." });
	$("pr-ca").value = "tomato"; $("pr-cb").value = "tomato";
	setTimeout(function () { setSel("pr-caa", "us"); setSel("pr-cba", "uk"); cmpSide("a"); cmpSide("b"); }, 600);
	var first = Q.q || S.last || "pronunciation";
	$("pr-q").value = first;
	show(first, { noUrl: !Q.q });
	window.MESPronDebug = { cur: cur, S: S, show: show, play: play, voices: function () { return voices; } };
})();
