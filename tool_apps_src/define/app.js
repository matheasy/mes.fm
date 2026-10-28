/* MES Dictionary (mes.fm/define): look up a word (Wiktionary REST + wikitext, dictionaryapi.dev as a fallback), hear it (MES Pronounce's data,
   speech voices, Commons recordings), read it aloud, translate it (MES Translate), save it, flashcards + quiz, word of the day, and "On MES"
   pages from the site search index (window.MESSearch, pre_js). Pure helpers: MESDef (lib.js), MESPron (pronounce lib), SRLib (speedreader lib). */
(function () {
	"use strict";
	var D = window.MESDef, P = window.MESPron, SR = window.SRLib;
	var root = document.getElementById("df");
	if (!root || !D) return;
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function toast(msg) { var t = $("df-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	function copy(text, msg) {
		var ok = function () { toast(msg || "Copied"); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) { toast("Could not copy"); } ta.remove(); }
	}

	/* ---------- saved state ---------- */
	var KEY = "mes-define:v1";
	var S = { saved: [], recent: [], tr: D.trDefault(navigator.language), sort: "new" };
	try { var st = JSON.parse(localStorage.getItem(KEY) || "{}"); if (st && typeof st === "object") Object.keys(S).forEach(function (k) { if (st[k] != null) S[k] = st[k]; }); } catch (e) {}
	if (!Array.isArray(S.saved)) S.saved = [];
	if (!Array.isArray(S.recent)) S.recent = [];
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	window.addEventListener("storage", function (e) {
		if (e.key !== KEY) return;
		try { var n = JSON.parse(e.newValue || "{}"); if (Array.isArray(n.saved)) S.saved = n.saved; if (Array.isArray(n.recent)) S.recent = n.recent; renderSaved(); renderRecent(); paintSaveBtn(); } catch (x) {}
	});

	/* ---------- fetching ---------- */
	var cache = {};
	function getJson(url, ms) {
		var ctl = typeof AbortController === "function" ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 12000);
		return fetch(url, { signal: ctl ? ctl.signal : undefined, credentials: "omit" }).then(function (r) {
			clearTimeout(t);
			if (r.status === 404) return { notFound: true };
			if (!r.ok) throw new Error("HTTP " + r.status);
			return r.json().then(function (j) { return { json: j }; });
		}, function (e) { clearTimeout(t); throw e; });
	}
	function fetchEntry(word) {
		var lk = word.toLowerCase();
		if (cache[lk]) return cache[lk];
		var tries = D.variants(word), netErr = null, onlyOther = null;
		function next(i) {
			if (i >= tries.length) return dictApi(word).then(function (e) { return e || { missing: true, other: onlyOther, netErr: netErr }; });
			var w = tries[i];
			var wt = getJson(D.wikitextUrl(w), 15000).catch(function () { return null; });
			return getJson(D.restUrl(w)).then(function (r) {
				if (r.notFound || !r.json) return next(i + 1);
				var rest = D.parseRest(r.json);
				if (!rest.pos.length) { onlyOther = onlyOther || { word: w, langs: rest.other }; return next(i + 1); }
				return wt.then(function (x) {
					var e = D.build(w, r.json, x && x.json ? x.json : null);
					e.source = "wiktionary";
					return e;
				});
			}, function (err) { netErr = err; return next(i + 1); });
		}
		cache[lk] = next(0).then(function (e) { if (!e || e.missing) delete cache[lk]; return e; }, function (err) { delete cache[lk]; throw err; });
		return cache[lk];
	}
	function dictApi(word) {
		return getJson(D.dictApiUrl(word), 9000).then(function (r) {
			if (!r.json) return null;
			var d = D.parseDictApi(r.json);
			if (!d.pos.length) return null;
			var e = { word: Array.isArray(r.json) && r.json[0] && r.json[0].word || word, pos: d.pos, other: [], wiki: { etys: [], syn: d.syn, ant: d.ant, der: [], rel: [], see: [], alt: [], hyph: [], rhymes: [], ipa: d.ipa.map(function (x) { return { ipa: x, acc: "" }; }), audio: [], trans: [] }, apiAudio: d.audio, source: "dictapi" };
			e.short = D.shortDef(e);
			return e;
		}).catch(function () { return null; });
	}

	/* ---------- the entry ---------- */
	var cur = null, posShow = "all", token = 0, expanded = {};
	function msg(html, kind) { var m = $("df-msg"); if (!html) { m.hidden = true; m.innerHTML = ""; return; } m.hidden = false; m.className = "tu-card df-msg" + (kind ? " df-msg--" + kind : ""); m.innerHTML = html; }
	function lookup(word, opts) {
		opts = opts || {};
		var w = D.normWord(word);
		if (!w) return;
		$("df-q").value = w;
		hideSug();
		stopRead();
		var my = ++token;
		msg('<span class="df-spin" aria-hidden="true"></span> Looking up <strong>' + esc(w) + "</strong>…");
		if (!opts.noHistory) {
			var url = "/define?w=" + encodeURIComponent(w).replace(/%20/g, "+");
			try { if (opts.replace) history.replaceState({ w: w }, "", opts.keepUrl ? location.href : url); else history.pushState({ w: w }, "", url); } catch (e) {}
		}
		fetchEntry(w).then(function (e) {
			if (my !== token) return;
			if (e.missing) return notFound(w, e);
			msg("");
			cur = e; posShow = "all"; expanded = {};
			if (!opts.quiet) { S.recent = D.addRecent(S.recent, e.word); save(); renderRecent(); }
			document.title = e.word + ": definition, pronunciation and translation | MES Dictionary";
			render();
			if (opts.scroll) $("df-entry").scrollIntoView({ behavior: "smooth", block: "start" });
		}, function () {
			if (my !== token) return;
			msg("Could not reach the dictionary. Check your connection and try again. <button type=\"button\" class=\"df-link\" data-w=\"" + esc(w) + "\">Try again</button>", "err");
		});
	}
	function notFound(w, info) {
		$("df-entry").hidden = true; $("df-more").hidden = true; cur = null;
		document.title = w + ": not found | MES Dictionary";
		var html = "<strong>" + esc(w) + "</strong> is not in the dictionary" + (info.netErr ? " (or the dictionary could not be reached)" : "") + ".";
		if (info.other && info.other.langs && info.other.langs.length) html += " Wiktionary has it as a word in " + esc(info.other.langs.slice(0, 5).join(", ")) + ': <a href="https://en.wiktionary.org/wiki/' + encodeURIComponent(D.title(info.other.word)) + '" target="_blank" rel="noopener">see it there</a>.';
		msg(html + '<div class="df-didyou" id="df-didyou"></div>', "warn");
		getJson(D.suggestUrl(w.slice(0, Math.max(3, w.length - 2))), 8000).then(function (r) {
			var list = D.parseSuggest(r.json, w).filter(function (x) { return x.toLowerCase() !== w.toLowerCase(); });
			list.sort(function (a, b) { return D.edits(a, w) - D.edits(b, w); });
			var box = $("df-didyou");
			if (box && list.length) box.innerHTML = '<span class="df-chiplab">Did you mean:</span> ' + list.slice(0, 6).map(function (x) { return '<button type="button" class="tu-chip" data-w="' + esc(x) + '">' + esc(x) + "</button>"; }).join(" ");
		}).catch(function () {});
	}

	function segsHtml(segs) {
		return (segs || []).map(function (s) { return s.w ? '<a class="df-wl" href="/define?w=' + encodeURIComponent(s.w) + '" data-w="' + esc(s.w) + '" title="Look up ' + esc(s.w) + '">' + esc(s.t) + "</a>" : esc(s.t); }).join("");
	}
	function chips(list, cls) { return list.map(function (x) { return '<button type="button" class="tu-chip ' + (cls || "") + '" data-w="' + esc(x) + '">' + esc(x) + "</button>"; }).join(" "); }
	var SHOW = 8;
	function render() {
		var e = cur;
		$("df-entry").hidden = false; $("df-more").hidden = false;
		$("df-word").textContent = e.word;
		$("df-pr").href = D.pronounceLink(e.word);
		paintSaveBtn();
		// parts of speech filter
		var bar = $("df-posbar");
		if (e.pos.length > 1) {
			bar.innerHTML = '<button type="button" class="df-pchip" data-pos="all" aria-pressed="true">All <span class="df-n">' + e.pos.reduce(function (a, p) { return a + p.senses.length; }, 0) + "</span></button>" +
				e.pos.map(function (p, i) { return '<button type="button" class="df-pchip" data-pos="' + i + '" aria-pressed="false">' + esc(p.pos) + ' <span class="df-n">' + p.senses.length + "</span></button>"; }).join("");
			bar.hidden = false;
		} else { bar.innerHTML = ""; bar.hidden = true; }
		renderSenses();
		$("df-src").innerHTML = e.source === "dictapi"
			? 'From <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener">dictionaryapi.dev</a> (built from Wiktionary, CC BY-SA). <a href="' + esc(D.wiktionaryPage(e.word)) + '" target="_blank" rel="noopener">Wiktionary page</a>.'
			: 'From <a href="' + esc(D.wiktionaryPage(e.word)) + '" target="_blank" rel="noopener">Wiktionary, the free dictionary</a>, under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> (formatting changed).';
		renderPron();
		renderEty(); renderForms(); renderThes(); renderRel(); renderTrans();
		renderMes();
		// a saved word without its meaning (a list imported as plain words) gets it now
		var si = D.indexOfWord(S.saved, e.word);
		if (si >= 0 && !S.saved[si].d && e.short.text) { S.saved[si].d = e.short.text; S.saved[si].p = e.short.pos; save(); renderSaved(); }
	}
	function renderSenses() {
		var e = cur, html = "";
		e.pos.forEach(function (p, i) {
			if (posShow !== "all" && String(i) !== posShow) return;
			var n = p.senses.length, lim = expanded[i] ? n : SHOW, depth1 = 0;
			html += '<section class="df-pos" data-sid="p' + i + '"><h3 class="df-posh">' + esc(p.pos);
			if (p.forms && p.forms.rows && p.forms.rows.length) html += ' <span class="df-posf">' + p.forms.rows.map(function (r) { return esc(r[1]); }).join(" · ") + "</span>";
			else if (p.forms && p.forms.note) html += ' <span class="df-posf">(' + esc(p.forms.note) + ")</span>";
			html += "</h3><ol class=\"df-ol\">";
			p.senses.forEach(function (s, j) {
				if (j >= lim) return;
				var sub = s.depth > 1;
				if (!sub) depth1++;
				html += '<li class="df-sense' + (sub ? " df-sub" : "") + '" data-sid="s' + i + "-" + j + '"><span class="df-num" aria-hidden="true">' + (sub ? "•" : depth1) + "</span><div class=\"df-sbody\">" +
					(s.labels && s.labels.length ? s.labels.map(function (l) { return '<span class="df-lab">' + esc(l) + "</span>"; }).join("") + " " : "") +
					'<span class="df-def">' + segsHtml(s.segs) + "</span>" +
					(s.formOf ? ' <button type="button" class="df-link df-formof" data-w="' + esc(s.formOf) + '">Look up “' + esc(s.formOf) + "”</button>" : "") +
					(s.ex && s.ex.length ? '<ul class="df-ex">' + s.ex.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
					(s.syn && s.syn.length ? '<div class="df-nym"><span class="df-nyml">Synonyms</span> ' + chips(s.syn.slice(0, 12), "df-syn") + "</div>" : "") +
					(s.ant && s.ant.length ? '<div class="df-nym"><span class="df-nyml">Antonyms</span> ' + chips(s.ant.slice(0, 12), "df-ant") + "</div>" : "") +
					"</div></li>";
			});
			html += "</ol>";
			if (n > SHOW) html += '<button type="button" class="df-link df-moreb" data-more="' + i + '">' + (expanded[i] ? "Show fewer" : "Show all " + n + " meanings") + "</button>";
			html += "</section>";
		});
		$("df-senses").innerHTML = html;
		Array.prototype.forEach.call($("df-posbar").querySelectorAll(".df-pchip"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-pos") === posShow ? "true" : "false"); });
	}

	/* ---------- pronunciation ---------- */
	var shards = {};
	function shardFor(w) {
		if (!P) return Promise.resolve({});
		var k = P.shardOf(w);
		if (!shards[k]) shards[k] = fetch(P.shardUrl(w)).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { delete shards[k]; return {}; });
		return shards[k];
	}
	var recs = [];
	function renderPron() {
		var e = cur, w = e.word, my = token;
		var wikiIpa = e.wiki.ipa || [];
		recs = [];
		(e.wiki.audio || []).forEach(function (a) { var c = D.commonsAudio(a.file); if (c) recs.push({ url: c.mp3, page: c.page, acc: a.acc || "Recording" }); });
		(e.apiAudio || []).forEach(function (a) { recs.push({ url: a.url, page: "", acc: a.acc || "Recording" }); });
		var first = wikiIpa.filter(function (x) { return /US|UK/.test(x.acc); })[0] || wikiIpa[0];
		function line(cmu) {
			var parts = [];
			var ipa = first ? first.ipa : cmu ? cmu.ipa : "";
			if (ipa) parts.push('<span class="df-ipa" title="IPA' + (first && first.acc ? ", " + esc(first.acc) : "") + '">' + esc(ipa) + "</span>");
			if (cmu) parts.push('<span class="df-resp" title="Say it like">' + esc(cmu.respell.map(function (x, i) { return cmu.stress[i] === 1 ? x.toUpperCase() : x; }).join("-")) + "</span>");
			if (e.wiki.hyph && e.wiki.hyph[0]) parts.push('<span class="df-hyph" title="Hyphenation">' + esc(e.wiki.hyph[0]) + "</span>");
			$("df-pron").innerHTML = parts.join('<span class="df-dot" aria-hidden="true"> · </span>');
		}
		line(null);
		var body = '<div id="df-cmu"></div>';
		if (wikiIpa.length) body += '<div class="df-prrow"><span class="df-k">IPA</span><span class="df-v">' + wikiIpa.slice(0, 6).map(function (x) { return '<span class="df-ipa">' + esc(x.ipa) + "</span>" + (x.acc ? ' <span class="df-acc">' + esc(x.acc) + "</span>" : ""); }).join("<br>") + "</span></div>";
		if (recs.length) body += '<div class="df-prrow"><span class="df-k">Recordings</span><span class="df-v df-recs">' + recs.slice(0, 6).map(function (r, i) { return '<button type="button" class="df-rec" data-rec="' + i + '" title="Play this recording">&#9654;&#65038; ' + esc(r.acc) + "</button>"; }).join(" ") + '<br><span class="df-small">Real speakers from <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a>' + (recs[0].page ? ' (<a href="' + esc(recs[0].page) + '" target="_blank" rel="noopener">source and licence</a>)' : "") + ".</span></span></div>";
		if (e.wiki.rhymes && e.wiki.rhymes.length) body += '<div class="df-prrow"><span class="df-k">Rhymes</span><span class="df-v df-ipa">' + esc(e.wiki.rhymes.join(", ")) + "</span></div>";
		body += '<p class="df-prlink"><a href="' + esc(D.pronounceLink(w)) + '">Hear it slowly, syllable by syllable and in other accents in MES Pronounce</a></p>';
		$("df-prbody").innerHTML = body;
		if (!P || / /.test(w)) return;
		shardFor(w).then(function (sh) {
			if (my !== token) return;
			var entry = sh[P.normWord(w)];
			var fs = P.forms(w, entry);
			var f = fs.filter(function (x) { return x.label !== "Usual"; })[0] || fs[0];
			if (!f) { line(null); return; }
			line(f);
			var syl = f.syls.map(function (s, i) { return '<span class="df-syl df-syl' + s.stress + '">' + esc(f.respell[i]) + "</span>"; }).join('<span class="df-sylsep" aria-hidden="true">·</span>');
			$("df-cmu").innerHTML = '<div class="df-prrow"><span class="df-k">Syllables</span><span class="df-v"><span class="df-syls" aria-label="' + esc(f.respell.join("-")) + '">' + syl + '</span> <span class="df-small">(' + f.syls.length + (f.syls.length === 1 ? " syllable" : " syllables") + (f.syls.length > 1 ? ", stressed one bigger" : "") + ")</span></span></div>" +
				'<div class="df-prrow"><span class="df-k">Say it like</span><span class="df-v df-resp">' + esc(f.respell.map(function (x, i) { return f.stress[i] === 1 ? x.toUpperCase() : x; }).join("-")) + "</span></div>" +
				(fs.length > 1 ? '<div class="df-prrow"><span class="df-k">Also</span><span class="df-v">' + fs.filter(function (x) { return x !== f; }).slice(0, 3).map(function (x) { return '<span class="df-ipa">' + esc(x.ipa) + '</span> <span class="df-acc">' + esc(x.label) + (x.note ? ", " + esc(x.note) : "") + "</span>"; }).join("<br>") + "</span></div>" : "");
		});
	}
	var audioEl = null;
	function playRec(i) {
		var r = recs[i];
		if (!r) return false;
		try { if (audioEl) audioEl.pause(); audioEl = new Audio(r.url); audioEl.play().catch(function () { toast("Could not play that recording"); }); } catch (e) { return false; }
		return true;
	}

	/* ---------- speech ---------- */
	var hasTTS = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function", voices = [];
	function loadVoices() { try { voices = (speechSynthesis.getVoices() || []).filter(function (v) { return v && v.lang; }); } catch (e) { voices = []; } }
	if (hasTTS) { loadVoices(); try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch (e) { speechSynthesis.onvoiceschanged = loadVoices; } }
	function enVoice() {
		var bad = {};
		try { bad = JSON.parse(localStorage.getItem("mes-speedreader:badvoices") || "{}") || {}; } catch (e) {}
		var en = voices.filter(function (v) { return /^en/i.test(v.lang); });
		if (SR && SR.pickVoice) return SR.pickVoice(en.length ? en : voices, "en", navigator.language, bad) || en[0] || null;
		return en[0] || null;
	}
	function say(text, opts) {
		opts = opts || {};
		if (!hasTTS) { if (opts.fallbackRec && playRec(0)) return; toast("This browser cannot speak. Try a recording below."); return; }
		var u = new SpeechSynthesisUtterance(text), v = enVoice();
		if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
		u.rate = opts.rate || 0.95;
		if (opts.onstart) u.onstart = opts.onstart;
		u.onend = opts.onend || null; u.onerror = opts.onend || null;
		say.keep = u;   // keep a reference (Chrome drops unreferenced utterances)
		try { speechSynthesis.speak(u); } catch (e) { if (opts.onend) opts.onend(); }
	}
	function hear(w) { stopRead(); try { if (hasTTS) speechSynthesis.cancel(); } catch (e) {} say(w || (cur && cur.word) || "", { fallbackRec: true, rate: 0.9 }); }
	var reading = false;
	function stopRead() {
		if (!reading) return;
		reading = false;
		try { speechSynthesis.cancel(); } catch (e) {}
		Array.prototype.forEach.call(root.querySelectorAll(".df-reading"), function (x) { x.classList.remove("df-reading"); });
		$("df-read").setAttribute("aria-pressed", "false"); $("df-read").querySelector(".df-tbl").textContent = "Read aloud";
	}
	function readAloud() {
		if (reading) { stopRead(); return; }
		if (!cur) return;
		if (!hasTTS) { toast("This browser cannot read aloud"); return; }
		try { speechSynthesis.cancel(); } catch (e) {}
		var parts = D.speechParts(cur, 999).filter(function (p) {
			if (p.id === "w") return true;
			var m = /^[ps](\d+)(?:-(\d+))?$/.exec(p.id);
			if (!m) return true;
			if (posShow !== "all" && m[1] !== posShow) return false;
			return !m[2] || expanded[m[1]] || +m[2] < SHOW;
		});
		reading = true; $("df-read").setAttribute("aria-pressed", "true"); $("df-read").querySelector(".df-tbl").textContent = "Stop";
		var i = 0;
		(function next() {
			if (!reading) return;
			Array.prototype.forEach.call(root.querySelectorAll(".df-reading"), function (x) { x.classList.remove("df-reading"); });
			if (i >= parts.length) { stopRead(); return; }
			var p = parts[i++], el = p.id === "w" ? $("df-word") : root.querySelector('[data-sid="' + p.id + '"]');
			if (el) { el.classList.add("df-reading"); if (el.scrollIntoView && p.id[0] === "s") { var r = el.getBoundingClientRect(); if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: "center", behavior: "smooth" }); } }
			say(p.text, { onend: function () { setTimeout(next, 120); }, rate: 1 });
		})();
	}

	/* ---------- etymology, forms, synonyms, related, translations ---------- */
	function renderEty() {
		var etys = cur.wiki.etys || [];
		$("df-etycard").hidden = !etys.length;
		$("df-ety").innerHTML = etys.slice(0, 4).map(function (segs, i) { return (etys.length > 1 ? '<p class="df-etyn">' + (i + 1) + ".</p>" : "") + '<p class="df-etyp">' + segsHtml(segs) + "</p>"; }).join("");
	}
	function renderForms() {
		var rows = [];
		cur.pos.forEach(function (p) { if (p.forms && (p.forms.rows.length || p.forms.note)) rows.push(p); });
		$("df-formscard").hidden = !rows.length;
		$("df-forms").innerHTML = rows.map(function (p) {
			return '<div class="df-fgroup"><h3 class="df-fh">' + esc(p.pos) + (p.forms.note ? ' <span class="df-small">(' + esc(p.forms.note) + ")</span>" : "") + "</h3>" +
				(p.forms.rows.length ? '<table class="df-ftab"><tbody>' + p.forms.rows.map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table>" : "") + "</div>";
		}).join("");
	}
	function gatherNyms(kind) {
		var all = [];
		cur.pos.forEach(function (p) { (p[kind] || []).forEach(function (x) { all.push(x); }); p.senses.forEach(function (s) { (s[kind] || []).forEach(function (x) { all.push(x); }); }); });
		(cur.wiki[kind] || []).forEach(function (x) { all.push(x); });
		var seen = {};
		return all.filter(function (x) { var k = x.toLowerCase(); if (seen[k] || k === cur.word.toLowerCase()) return false; seen[k] = 1; return true; });
	}
	function renderThes() {
		var syn = gatherNyms("syn"), ant = gatherNyms("ant");
		$("df-thescard").hidden = !syn.length && !ant.length;
		$("df-thes").innerHTML = (syn.length ? '<h3 class="df-fh">Synonyms <span class="df-n">' + syn.length + '</span></h3><div class="df-chipbox">' + chips(syn.slice(0, 40), "df-syn") + "</div>" : "") +
			(ant.length ? '<h3 class="df-fh">Antonyms <span class="df-n">' + ant.length + '</span></h3><div class="df-chipbox">' + chips(ant.slice(0, 30), "df-ant") + "</div>" : "");
	}
	var REL_LIM = 24;
	function renderRel() {
		var w = cur.wiki, groups = [["Derived terms", w.der], ["Related terms", w.rel], ["See also", w.see], ["Other spellings", w.alt]].filter(function (g) { return g[1] && g[1].length; });
		$("df-relcard").hidden = !groups.length;
		$("df-rel").innerHTML = groups.map(function (g, i) {
			var many = g[1].length > REL_LIM;
			return '<h3 class="df-fh">' + g[0] + ' <span class="df-n">' + g[1].length + '</span></h3><div class="df-chipbox" data-rel="' + i + '">' + chips(many ? g[1].slice(0, REL_LIM) : g[1]) +
				(many ? ' <button type="button" class="df-link" data-relall="' + i + '">Show all ' + g[1].length + "</button>" : "") + "</div>";
		}).join("");
		$("df-rel").relGroups = groups;
	}
	function renderTrans() {
		var t = cur.wiki.trans || [];
		$("df-trcard").hidden = !t.length;
		if (!t.length) return;
		$("df-trgloss").innerHTML = t.map(function (x, i) { return '<option value="' + i + '">' + esc((x.pos ? x.pos + ": " : "") + (x.gloss || "meaning " + (i + 1))) + "</option>"; }).join("");
		$("df-trgloss").hidden = t.length < 2;
		$("df-trfilter").value = "";
		renderTransList();
	}
	function renderTransList() {
		var t = (cur.wiki.trans || [])[+$("df-trgloss").value || 0];
		if (!t) return;
		var f = $("df-trfilter").value.trim().toLowerCase(), mine = S.tr;
		var items = t.items.filter(function (x) { return !f || x.lang.toLowerCase().indexOf(f) >= 0; });
		items.sort(function (a, b) { return (a.code === mine ? -1 : 0) - (b.code === mine ? -1 : 0); });
		$("df-trlist").innerHTML = items.length ? '<table class="df-trtab"><tbody>' + items.slice(0, f ? 400 : 120).map(function (x) {
			return "<tr><th>" + esc(x.lang) + '</th><td lang="' + esc(x.code) + '">' + esc(x.words.join(", ")) + '</td><td><a class="df-link" href="' + esc(D.translateLink(cur.word, x.code)) + '" target="_blank" rel="noopener" title="Open in MES Translate">Translate</a></td></tr>';
		}).join("") + "</tbody></table>" : '<p class="tu-note">No language matches.</p>';
	}

	/* ---------- On MES ---------- */
	function renderMes() {
		var box = $("df-mes"), w = cur.word, my = token;
		box.hidden = true;
		if (!window.MESSearch) return;
		window.MESSearch.load().then(function () {
			if (my !== token) return;
			var picks = [];
			D.stems(w).forEach(function (s) { picks = picks.concat(D.mesPick(window.MESSearch.search(s).items, w, 8)); });
			var seen = {}; picks = picks.filter(function (p) { if (seen[p.path]) return false; seen[p.path] = 1; return true; });
			picks.sort(function (a, b) { return a.rank - b.rank || (b.strong ? 1 : 0) - (a.strong ? 1 : 0); });
			var fun = 0, strong = picks.filter(function (p) { return p.strong; }).length, weak = 0;
			picks = picks.filter(function (p) { return (p.rank < 6 || fun++ < 1) && (p.strong || !strong || weak++ < 2); }).slice(0, 6);
			if (!picks.length) return;
			$("df-mesgrid").innerHTML = picks.map(function (p) {
				return '<a class="df-mescard" href="' + esc(p.path) + '">' + (p.thumb ? '<img src="' + esc(p.thumb) + '" alt="" loading="lazy" width="64" height="64">' : '<span class="df-mesph" aria-hidden="true">&#8730;</span>') +
					'<span class="df-mest"><span class="df-mesn">' + esc(p.title) + '</span><span class="df-mesc">' + esc(p.cat) + '</span><span class="df-mesd">' + esc(String(p.desc || "").slice(0, 110)) + "</span></span></a>";
			}).join("");
			box.hidden = false;
		}).catch(function () {});
	}

	/* ---------- saving ---------- */
	function isSaved(w) { return D.indexOfWord(S.saved, w) >= 0; }
	function paintSaveBtn() {
		if (!cur) return;
		var on = isSaved(cur.word), b = $("df-save");
		b.setAttribute("aria-pressed", on ? "true" : "false");
		b.firstElementChild.innerHTML = on ? "&#9733;" : "&#9734;";
		b.querySelector(".df-tbl").textContent = on ? "Saved" : "Save";
	}
	function toggleSave() {
		if (!cur) return;
		if (isSaved(cur.word)) { var old = S.saved.slice(); S.saved = D.removeSaved(S.saved, cur.word); undoToast("Removed from your words", function () { S.saved = old; }); }
		else { S.saved = D.addSaved(S.saved, { w: cur.word, d: cur.short.text, p: cur.short.pos }); toast("Saved: " + cur.word); }
		save(); paintSaveBtn(); renderSaved();
	}
	function undoToast(text, undo) {
		var t = $("df-toast");
		t.innerHTML = esc(text) + ' <button type="button" class="df-undo">Undo</button>';
		t.classList.add("tu-toast--show");
		t.querySelector(".df-undo").onclick = function () { undo(); save(); paintSaveBtn(); renderSaved(); t.classList.remove("tu-toast--show"); };
		clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 6000);
	}
	function renderSaved() {
		var f = $("df-sfilter").value.trim().toLowerCase(), list = S.saved.slice();
		$("df-nsaved").textContent = S.saved.length ? S.saved.length : "";
		if (S.sort === "az") list.sort(function (a, b) { return a.w.localeCompare(b.w); });
		else if (S.sort === "box") list.sort(function (a, b) { return (a.b || 0) - (b.b || 0); });
		if (f) list = list.filter(function (x) { return x.w.toLowerCase().indexOf(f) >= 0 || String(x.d).toLowerCase().indexOf(f) >= 0; });
		$("df-sempty").hidden = S.saved.length > 0;
		$("df-slist").innerHTML = list.slice(0, 500).map(function (x) {
			var dots = ""; for (var i = 1; i <= 5; i++) dots += '<span class="df-box' + ((x.b || 0) >= i ? " on" : "") + '"></span>';
			return '<li class="df-sitem"><button type="button" class="df-sw" data-w="' + esc(x.w) + '">' + esc(x.w) + "</button>" + (x.p ? ' <span class="df-sp">' + esc(x.p.toLowerCase()) + "</span>" : "") +
				'<span class="df-boxes2" title="How well you know it (flashcards): ' + (x.b || 0) + ' of 5">' + dots + '</span><button type="button" class="df-x" data-del="' + esc(x.w) + '" title="Remove ' + esc(x.w) + '" aria-label="Remove ' + esc(x.w) + '">&times;</button>' +
				(x.d ? '<span class="df-sd">' + esc(x.d) + "</span>" : "") + "</li>";
		}).join("");
		$("df-ssort").value = S.sort;
	}
	function renderRecent() {
		var r = S.recent.slice(0, 10);
		$("df-recentrow").hidden = !r.length;
		$("df-recent").innerHTML = chips(r);
	}

	/* ---------- flashcards ---------- */
	var card = null, flipped = false;
	function nextFlash(skip) {
		card = D.nextCard(S.saved, Date.now(), skip);
		var has = !!card;
		$("df-cardbox").hidden = !has; $("df-cardempty").hidden = has;
		if (!has) return;
		flipped = false;
		$("df-flashf").textContent = card.w;
		$("df-flashb").innerHTML = (card.p ? '<span class="df-flashp">' + esc(card.p.toLowerCase()) + "</span>" : "") + esc(card.d);
		$("df-flashb").hidden = true; $("df-flashhint").hidden = false; $("df-flashf").hidden = false;
		var due = S.saved.filter(function (x) { return x.d && (x.n || 0) <= Date.now(); }).length;
		$("df-cardinfo").textContent = due ? due + (due === 1 ? " card is" : " cards are") + " due" : "Nothing due: practising ahead";
		var counts = [0, 0, 0, 0, 0, 0];
		S.saved.forEach(function (x) { counts[x.b || 0]++; });
		$("df-boxes").textContent = "New: " + counts[0] + " · Learning: " + (counts[1] + counts[2]) + " · Known: " + (counts[3] + counts[4]) + " · Mastered: " + counts[5];
	}
	function flip() { if (!card) return; flipped = !flipped; $("df-flashb").hidden = !flipped; $("df-flashf").hidden = false; $("df-flashhint").hidden = flipped; }
	function gradeCard(ok) {
		if (!card) return;
		var i = D.indexOfWord(S.saved, card.w);
		if (i >= 0) { S.saved[i] = D.grade(S.saved[i], ok); save(); }
		var w = card.w;
		nextFlash(w); renderSaved();
	}

	/* ---------- quiz ---------- */
	var qz = null, qseed = Date.now() % 100000, qscore = [0, 0];
	function newQuiz() {
		qz = D.quiz(S.saved, ++qseed);
		$("df-quizbox").hidden = !qz; $("df-quizempty").hidden = !!qz;
		if (!qz) return;
		$("df-qdef").innerHTML = (qz.pos ? '<span class="df-flashp">' + esc(qz.pos.toLowerCase()) + "</span> " : "") + esc(qz.def);
		$("df-qopts").innerHTML = qz.options.map(function (o, i) { return '<button type="button" class="df-qopt" data-q="' + i + '">' + esc(o) + "</button>"; }).join("");
		$("df-qres").textContent = "";
		$("df-qscore").textContent = qscore[1] ? qscore[0] + " of " + qscore[1] + " right" : "";
	}
	function answer(i) {
		if (!qz || qz.done) return;
		qz.done = true;
		var ok = i === qz.answer;
		qscore[1]++; if (ok) qscore[0]++;
		Array.prototype.forEach.call($("df-qopts").children, function (b, k) { b.disabled = true; if (k === qz.answer) b.classList.add("ok"); else if (k === i) b.classList.add("no"); });
		$("df-qres").innerHTML = ok ? "Right!" : "It was <button type=\"button\" class=\"df-link\" data-w=\"" + esc(qz.word) + "\">" + esc(qz.word) + "</button>.";
		var j = D.indexOfWord(S.saved, qz.word);
		if (j >= 0 && !ok) { S.saved[j] = D.grade(S.saved[j], false); save(); renderSaved(); }
		$("df-qscore").textContent = qscore[0] + " of " + qscore[1] + " right";
		$("df-qnext").focus();
	}

	/* ---------- word of the day ---------- */
	function renderWotd() {
		var today = D.wordOfDay(new Date());
		$("df-wotdchip").textContent = today.w;
		$("df-wotdchip").setAttribute("data-w", today.w);
		var html = "", fmt;
		try { fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch (e) { fmt = null; }
		for (var i = 0; i < 7; i++) {
			var d = new Date(); d.setDate(d.getDate() - i);
			var x = D.wordOfDay(d);
			html += '<li class="df-witem' + (i === 0 ? " df-today" : "") + '"><span class="df-wdate">' + (i === 0 ? "Today" : fmt ? esc(fmt.format(d)) : "") + '</span><button type="button" class="df-sw" data-w="' + esc(x.w) + '">' + esc(x.w) + '</button> <span class="df-sp">' + esc(x.p) + '</span><span class="df-sd">' + esc(x.d) + "</span></li>";
		}
		$("df-wlist").innerHTML = html;
	}

	/* ---------- tabs ---------- */
	var TABS = ["saved", "cards", "quiz", "wotd"], tab = "saved";
	function setTab(t) {
		tab = t;
		TABS.forEach(function (x) { $("df-t-" + x).setAttribute("aria-selected", x === t ? "true" : "false"); $("df-p-" + x).hidden = x !== t; });
		if (t === "cards") nextFlash();
		if (t === "quiz" && !qz) newQuiz();
	}

	/* ---------- fill window ---------- */
	var filled = null;
	function fill(el) {
		if (filled) unfill();
		if (!el) return;
		filled = el; el.classList.add("df-filled"); document.documentElement.classList.add("df-nofs");
	}
	function unfill() { if (!filled) return; filled.classList.remove("df-filled"); document.documentElement.classList.remove("df-nofs"); filled = null; }

	/* ---------- suggestions ---------- */
	var sugT = 0, sugList = [], sugI = -1, sugQ = "";
	function hideSug() { $("df-sug").hidden = true; $("df-q").setAttribute("aria-expanded", "false"); sugI = -1; }
	function showSug() {
		var ul = $("df-sug");
		if (!sugList.length) { hideSug(); return; }
		ul.innerHTML = sugList.map(function (x, i) { return '<li role="option" id="df-sug' + i + '" class="df-sugi' + (i === sugI ? " on" : "") + '" aria-selected="' + (i === sugI) + '" data-w="' + esc(x) + '">' + esc(x) + "</li>"; }).join("");
		ul.hidden = false; $("df-q").setAttribute("aria-expanded", "true");
		$("df-q").setAttribute("aria-activedescendant", sugI >= 0 ? "df-sug" + sugI : "");
	}
	$("df-q").addEventListener("input", function () {
		var q = D.normWord(this.value);
		clearTimeout(sugT);
		if (q.length < 2) { sugList = []; hideSug(); return; }
		sugT = setTimeout(function () {
			sugQ = q;
			getJson(D.suggestUrl(q), 6000).then(function (r) { if (sugQ !== q || D.normWord($("df-q").value) !== q) return; sugList = D.parseSuggest(r.json, q); sugI = -1; showSug(); }).catch(function () {});
		}, 220);
	});
	$("df-q").addEventListener("keydown", function (e) {
		if ($("df-sug").hidden) return;
		if (e.key === "ArrowDown") { sugI = Math.min(sugList.length - 1, sugI + 1); showSug(); e.preventDefault(); }
		else if (e.key === "ArrowUp") { sugI = Math.max(-1, sugI - 1); showSug(); e.preventDefault(); }
		else if (e.key === "Escape") { hideSug(); e.stopPropagation(); }
		else if (e.key === "Enter" && sugI >= 0) { e.preventDefault(); lookup(sugList[sugI]); }
	});
	$("df-q").addEventListener("blur", function () { setTimeout(hideSug, 180); });
	$("df-sug").addEventListener("mousedown", function (e) { var li = e.target.closest("[data-w]"); if (li) { e.preventDefault(); lookup(li.getAttribute("data-w")); } });

	/* ---------- events ---------- */
	$("df-form").addEventListener("submit", function (e) { e.preventDefault(); lookup($("df-q").value); });
	root.addEventListener("click", function (e) {
		var t = e.target.closest("button, a");
		if (!t || !root.contains(t)) return;
		var w = t.getAttribute("data-w");
		if (w && t.tagName === "A" && (e.ctrlKey || e.metaKey || e.shiftKey || e.button)) return;   // open in a new tab as usual
		if (w) { e.preventDefault(); lookup(w, { scroll: true }); return; }
		if (t.hasAttribute("data-pos")) { posShow = t.getAttribute("data-pos"); stopRead(); renderSenses(); return; }
		if (t.hasAttribute("data-more")) { var k = t.getAttribute("data-more"); expanded[k] = !expanded[k]; renderSenses(); return; }
		if (t.hasAttribute("data-relall")) { var g = $("df-rel").relGroups[+t.getAttribute("data-relall")]; t.parentNode.innerHTML = chips(g[1]); return; }
		if (t.hasAttribute("data-rec")) { playRec(+t.getAttribute("data-rec")); return; }
		if (t.hasAttribute("data-del")) { var old = S.saved.slice(), dw = t.getAttribute("data-del"); S.saved = D.removeSaved(S.saved, dw); save(); renderSaved(); paintSaveBtn(); undoToast("Removed " + dw, function () { S.saved = old; }); return; }
		if (t.hasAttribute("data-q")) { answer(+t.getAttribute("data-q")); return; }
		if (t.getAttribute("role") === "tab") { setTab(t.id.replace("df-t-", "")); return; }
	});
	$("df-hear").addEventListener("click", function () { hear(); });
	$("df-save").addEventListener("click", toggleSave);
	$("df-copy").addEventListener("click", function () { if (cur) copy(D.plainText(cur), "Definitions copied"); });
	$("df-share").addEventListener("click", function () {
		if (!cur) return;
		var link = D.shareLink(cur.word), text = cur.word + ": " + cur.short.text;
		if (navigator.share && window.matchMedia && matchMedia("(pointer:coarse)").matches) navigator.share({ title: cur.word + " | MES Dictionary", text: text, url: link }).catch(function () {});
		else copy(link, "Link copied");
	});
	$("df-read").addEventListener("click", readAloud);
	$("df-trlang").innerHTML = D.TR_LANGS.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + "</option>"; }).join("");
	$("df-trlang").value = S.tr;
	$("df-trlang").addEventListener("change", function () { S.tr = this.value; save(); if (cur) renderTransList(); });
	$("df-tr").addEventListener("click", function () { if (cur) window.open(D.translateLink(cur.word, S.tr), "_blank", "noopener"); });
	$("df-fill").addEventListener("click", function () { if (filled) unfill(); else fill($("df-entry")); });
	$("df-fillclose").addEventListener("click", unfill);
	$("df-cardfill").addEventListener("click", function () { if (filled) unfill(); else fill($("df-cardbox")); });
	$("df-trgloss").addEventListener("change", renderTransList);
	$("df-trfilter").addEventListener("input", renderTransList);
	$("df-random").addEventListener("click", function () { var x = D.WOTD[Math.floor(Math.random() * D.WOTD.length)]; lookup(x[0], { scroll: true }); });
	$("df-recentclr").addEventListener("click", function () { S.recent = []; save(); renderRecent(); });
	$("df-sfilter").addEventListener("input", renderSaved);
	$("df-ssort").addEventListener("change", function () { S.sort = this.value; save(); renderSaved(); });
	$("df-slink").addEventListener("click", function () { if (!S.saved.length) { toast("No saved words yet"); return; } copy(D.listLink(S.saved.slice(0, 200).map(function (x) { return x.w; })), "Link to your list copied"); });
	$("df-scopy").addEventListener("click", function () { if (!S.saved.length) { toast("No saved words yet"); return; } copy(S.saved.map(function (x) { return x.w + (x.d ? " - " + x.d : ""); }).join("\n"), "List copied"); });
	$("df-sexport").addEventListener("click", function () {
		if (!S.saved.length) { toast("No saved words yet"); return; }
		var a = document.createElement("a"), url = URL.createObjectURL(new Blob([D.exportJson(S.saved)], { type: "application/json" }));
		a.href = url; a.download = "mes-dictionary-words-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove();
		setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
	});
	$("df-simport").addEventListener("change", function () {
		var f = this.files && this.files[0], inp = this;
		if (!f) return;
		f.text().then(function (txt) { var r = D.importText(S.saved, txt); S.saved = r.list; save(); renderSaved(); paintSaveBtn(); toast(r.added + (r.added === 1 ? " word" : " words") + " added"); inp.value = ""; });
	});
	$("df-sclear").addEventListener("click", function () { if (!S.saved.length) return; var old = S.saved.slice(); S.saved = []; save(); renderSaved(); paintSaveBtn(); undoToast("Cleared your list", function () { S.saved = old; }); });
	$("df-flash").addEventListener("click", flip);
	$("df-again").addEventListener("click", function () { gradeCard(false); });
	$("df-knew").addEventListener("click", function () { gradeCard(true); });
	$("df-cardhear").addEventListener("click", function () { if (card) say(card.w, { rate: 0.9 }); });
	$("df-qnext").addEventListener("click", newQuiz);
	$("df-wotdchip").addEventListener("click", function (e) { e.stopPropagation(); lookup(this.getAttribute("data-w"), { scroll: true }); });
	window.addEventListener("popstate", function (e) { var w = e.state && e.state.w || D.parseQuery(location.search, location.pathname).w; if (w) lookup(w, { noHistory: true }); });
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && filled) { unfill(); return; }
		var tg = e.target, typing = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable);
		if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
		if (tab === "cards" && !$("df-p-cards").hidden && card && (filled === $("df-cardbox") || isVisible($("df-cardbox")))) {
			if (e.key === " ") { e.preventDefault(); flip(); return; }
			if (e.key === "1") { gradeCard(false); return; }
			if (e.key === "2") { gradeCard(true); return; }
		}
		if (!cur) return;
		var k = e.key.toLowerCase();
		if (k === "h") hear(); else if (k === "s") toggleSave(); else if (k === "r") readAloud(); else if (k === "w") { if (filled) unfill(); else fill($("df-entry")); }
	});
	function isVisible(el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; }

	/* ---------- start ---------- */
	renderWotd(); renderRecent(); renderSaved();
	var q = D.parseQuery(location.search, location.pathname);
	if (q.list && q.list.length) {
		var fresh = q.list.filter(function (w) { return !isSaved(w); });
		msg("This link has a list of " + q.list.length + (q.list.length === 1 ? " word" : " words") + ": " + esc(q.list.slice(0, 12).join(", ")) + (q.list.length > 12 ? "…" : "") +
			(fresh.length ? ' <button type="button" class="tu-btn tu-btn--primary" id="df-addlist">Add ' + fresh.length + " to my words</button>" : " (all already in your words)"), "info");
		if (fresh.length) $("df-addlist").onclick = function () {
			fresh.slice().reverse().forEach(function (w) { S.saved = D.addSaved(S.saved, { w: w }); });
			save(); renderSaved(); msg(""); toast(fresh.length + " words added: meanings fill in as you look them up");
			setTab("saved"); $("df-mine").scrollIntoView({ behavior: "smooth" });
			// fetch the short meanings in the background, a few at a time, so flashcards and the quiz work
			var todo = fresh.slice(0, 60);
			(function pump() {
				var w = todo.shift(); if (!w) return;
				fetchEntry(w).then(function (e) { if (e && !e.missing) { var i = D.indexOfWord(S.saved, w); if (i >= 0 && !S.saved[i].d) { S.saved[i].d = e.short.text; S.saved[i].p = e.short.pos; save(); renderSaved(); } } }).catch(function () {}).then(function () { setTimeout(pump, 350); });
			})();
		};
		if (q.w) lookup(q.w, { replace: true, keepUrl: true, quiet: true });
	} else if (q.w) lookup(q.w, { replace: true });
	else lookup(D.wordOfDay(new Date()).w, { noHistory: true, quiet: true });
})();
