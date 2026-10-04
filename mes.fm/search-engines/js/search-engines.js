/* MES Search Engines -- the engine table and URL builder (no DOM; node-testable via require). Exposed as window.MESEngines.
 * An engine: { id, name, g (group), badge: [text, background, text colour], web: URL template, types: {images, news, videos}: templates,
 *   time: {d, w, m, y}: suffixes appended to the URL, variants: [{id, label, v}] (each ticked variant is its own target; {v} in a template is replaced),
 *   ops: true (site:/quotes/exclude operators are added), note }.
 * Templates use {q} (the URL-encoded query) and {v} (the variant value). */
(function (root) {
	"use strict";
	function V(list) { return list.map(function (x) { return { id: x[0], label: x[1], v: x[2] == null ? x[0] : x[2] }; }); }
	var GROUPS = [
		["general", "Web search engines", "Compare the main general-purpose search engines. Google, Bing, Yahoo and others have regional versions you can tick."],
		["ai", "AI answer engines", "Ask the same question of AI assistants and answer engines (most open with the question typed in; some need you to be logged in)."],
		["video", "Video, audio & alt-tech", "Where the same search finds different videos, and which videos some platforms don't show."],
		["social", "Social, news & forums", "Posts, discussions and publishing platforms."],
		["ref", "Reference, research & shopping", "Encyclopedias, papers, archives, maps, fact checks and shops."],
		["dev", "Developer & trends", "Code, questions and search trends."]
	];
	var G = function (d, l) { return [d, l]; };
	var ENGINES = [
		{ id: "google", g: "general", name: "Google", badge: ["G", "#4285f4"], ops: true, web: "https://www.google.{v}/search?q={q}",
			types: { images: "https://www.google.{v}/search?q={q}&tbm=isch", news: "https://www.google.{v}/search?q={q}&tbm=nws", videos: "https://www.google.{v}/search?q={q}&tbm=vid" },
			time: { d: "&tbs=qdr:d", w: "&tbs=qdr:w", m: "&tbs=qdr:m", y: "&tbs=qdr:y" },
			variants: V([["com", ".com"], ["ca", ".ca"], ["co.uk", ".co.uk"], ["com.au", ".com.au"], ["co.nz", ".co.nz"], ["ie", ".ie"], ["de", ".de"], ["fr", ".fr"], ["es", ".es"], ["it", ".it"], ["nl", ".nl"], ["se", ".se"], ["pl", ".pl"], ["co.in", ".co.in"], ["co.jp", ".co.jp"], ["com.br", ".com.br"], ["com.mx", ".com.mx"], ["co.za", ".co.za"], ["com.sg", ".com.sg"], ["ae", ".ae"]]),
			note: "Tick several domains to compare countries (needs a different IP or VPN to see a truly different region)." },
		{ id: "bing", g: "general", name: "Bing", badge: ["B", "#008373"], ops: true, web: "https://www.bing.com/search?q={q}&cc={v}",
			types: { images: "https://www.bing.com/images/search?q={q}&cc={v}", news: "https://www.bing.com/news/search?q={q}&cc={v}", videos: "https://www.bing.com/videos/search?q={q}&cc={v}" },
			time: { d: '&filters=ex1%3a%22ez1%22', w: '&filters=ex1%3a%22ez2%22', m: '&filters=ex1%3a%22ez3%22' },
			variants: V([["us", "US"], ["ca", "Canada"], ["gb", "UK"], ["au", "Australia"], ["de", "Germany"], ["fr", "France"], ["in", "India"], ["jp", "Japan"]]), note: "Also powers Yahoo, Ecosia and others." },
		{ id: "ddg", g: "general", name: "DuckDuckGo", badge: ["D", "#de5833"], ops: true, web: "https://duckduckgo.com/?q={q}&kl={v}",
			types: { images: "https://duckduckgo.com/?q={q}&kl={v}&iax=images&ia=images", news: "https://duckduckgo.com/?q={q}&kl={v}&iar=news&ia=news", videos: "https://duckduckgo.com/?q={q}&kl={v}&iax=videos&ia=videos" },
			time: { d: "&df=d", w: "&df=w", m: "&df=m", y: "&df=y" },
			variants: V([["wt-wt", "No region"], ["us-en", "US"], ["ca-en", "Canada"], ["uk-en", "UK"], ["au-en", "Australia"], ["de-de", "Germany"], ["fr-fr", "France"], ["es-es", "Spain"], ["in-en", "India"]]), note: "Region changes ranking; “!bangs” in the query also work." },
		{ id: "brave", g: "general", name: "Brave Search", badge: ["Br", "#fb542b"], ops: true, web: "https://search.brave.com/search?q={q}",
			types: { images: "https://search.brave.com/images?q={q}", news: "https://search.brave.com/news?q={q}", videos: "https://search.brave.com/videos?q={q}" },
			time: { d: "&tf=pd", w: "&tf=pw", m: "&tf=pm", y: "&tf=py" }, note: "Its own independent index." },
		{ id: "yahoo", g: "general", name: "Yahoo", badge: ["Y!", "#6001d2"], ops: true, web: "https://{v}/search?p={q}",
			types: { images: "https://images.search.yahoo.com/search/images?p={q}", news: "https://news.search.yahoo.com/search?p={q}", videos: "https://video.search.yahoo.com/search/video?p={q}" },
			time: { d: "&btf=d", w: "&btf=w", m: "&btf=m" },
			variants: V([["us", "US", "search.yahoo.com"], ["ca", "Canada", "ca.search.yahoo.com"], ["uk", "UK", "uk.search.yahoo.com"], ["au", "Australia", "au.search.yahoo.com"], ["de", "Germany", "de.search.yahoo.com"], ["fr", "France", "fr.search.yahoo.com"], ["in", "India", "in.search.yahoo.com"]]) },
		{ id: "ecosia", g: "general", name: "Ecosia", badge: ["Ec", "#2f8f46"], ops: true, web: "https://www.ecosia.org/search?q={q}",
			types: { images: "https://www.ecosia.org/images?q={q}", news: "https://www.ecosia.org/news?q={q}", videos: "https://www.ecosia.org/videos?q={q}" } },
		{ id: "startpage", g: "general", name: "Startpage", badge: ["Sp", "#3d5bd9"], ops: true, web: "https://www.startpage.com/sp/search?query={q}&cat=web",
			types: { images: "https://www.startpage.com/sp/search?query={q}&cat=pics", news: "https://www.startpage.com/sp/search?query={q}&cat=news", videos: "https://www.startpage.com/sp/search?query={q}&cat=video" },
			time: { d: "&with_date=d", w: "&with_date=w", m: "&with_date=m", y: "&with_date=y" }, note: "Google results without the tracking." },
		{ id: "qwant", g: "general", name: "Qwant", badge: ["Q", "#4a4a8a"], ops: true, web: "https://www.qwant.com/?q={q}&t=web", types: { images: "https://www.qwant.com/?q={q}&t=images", news: "https://www.qwant.com/?q={q}&t=news", videos: "https://www.qwant.com/?q={q}&t=videos" } },
		{ id: "mojeek", g: "general", name: "Mojeek", badge: ["Mj", "#4a8f3c"], ops: true, web: "https://www.mojeek.com/search?q={q}", types: { images: "https://www.mojeek.com/search?q={q}&fmt=images" }, note: "A fully independent crawler: often very different results." },
		{ id: "yandex", g: "general", name: "Yandex", badge: ["Ya", "#fc3f1d"], ops: true, web: "https://yandex.{v}/search/?text={q}",
			types: { images: "https://yandex.{v}/images/search?text={q}", videos: "https://yandex.{v}/video/search?text={q}" }, variants: V([["com", ".com"], ["ru", ".ru"], ["com.tr", ".com.tr"]]), note: "Handy for checking what Western engines leave out." },
		{ id: "baidu", g: "general", name: "Baidu", badge: ["百", "#2932e1"], web: "https://www.baidu.com/s?wd={q}", types: { images: "https://image.baidu.com/search/index?tn=baiduimage&word={q}", news: "https://news.baidu.com/ns?word={q}" }, note: "China's main engine." },
		{ id: "naver", g: "general", name: "Naver", badge: ["N", "#03c75a"], web: "https://search.naver.com/search.naver?query={q}" },
		{ id: "seznam", g: "general", name: "Seznam", badge: ["S", "#cc0000"], web: "https://search.seznam.cz/?q={q}" },
		{ id: "kagi", g: "general", name: "Kagi", badge: ["K", "#ffb319", "#222"], ops: true, web: "https://kagi.com/search?q={q}", note: "Paid, no ads; you need to be signed in." },
		{ id: "swisscows", g: "general", name: "Swisscows", badge: ["Sw", "#c8102e"], web: "https://swisscows.com/en/web?query={q}" },
		{ id: "metager", g: "general", name: "MetaGer", badge: ["Mg", "#e07a10"], web: "https://metager.org/meta/meta.ger3?eingabe={q}", note: "A metasearch engine from Germany." },
		{ id: "marginalia", g: "general", name: "Marginalia", badge: ["Ma", "#5c4b8a"], web: "https://search.marginalia.nu/search?query={q}", note: "Small, old-school and independent web." },
		{ id: "presearch", g: "general", name: "Presearch", badge: ["Pr", "#2f6fed"], web: "https://presearch.com/search?q={q}" },
		{ id: "dogpile", g: "general", name: "Dogpile", badge: ["Dp", "#e9630d"], web: "https://www.dogpile.com/serp?q={q}" },
		{ id: "searxng", g: "general", name: "SearXNG (searx.be)", badge: ["Sx", "#3050ff"], ops: true, web: "https://searx.be/search?q={q}", note: "A public metasearch instance. Instances come and go: add your favourite as a custom engine." },

		{ id: "perplexity", g: "ai", name: "Perplexity", badge: ["Px", "#20808d"], web: "https://www.perplexity.ai/search?q={q}" },
		{ id: "chatgpt", g: "ai", name: "ChatGPT", badge: ["Cg", "#10a37f"], web: "https://chatgpt.com/?q={q}&hints=search" },
		{ id: "grok", g: "ai", name: "Grok", badge: ["Gk", "#222"], web: "https://grok.com/?q={q}" },
		{ id: "claude", g: "ai", name: "Claude", badge: ["Cl", "#cc785c"], web: "https://claude.ai/new?q={q}" },
		{ id: "copilot", g: "ai", name: "Microsoft Copilot", badge: ["Co", "#0f6cbd"], web: "https://copilot.microsoft.com/?q={q}" },
		{ id: "googleai", g: "ai", name: "Google AI Mode", badge: ["AI", "#4285f4"], web: "https://www.google.com/search?q={q}&udm=50" },
		{ id: "you", g: "ai", name: "You.com", badge: ["Yo", "#2d3cff"], web: "https://you.com/search?q={q}" },
		{ id: "phind", g: "ai", name: "Phind", badge: ["Ph", "#4f46e5"], web: "https://www.phind.com/search?q={q}" },

		{ id: "youtube", g: "video", name: "YouTube", badge: ["YT", "#ff0000"], web: "https://www.youtube.com/results?search_query={q}", time: { d: "&sp=EgQIAhAB", w: "&sp=EgQIAxAB", m: "&sp=EgQIBBAB", y: "&sp=EgQIBRAB" } },
		{ id: "rumble", g: "video", name: "Rumble", badge: ["Ru", "#85c742", "#183000"], web: "https://rumble.com/search/video?q={q}" },
		{ id: "odysee", g: "video", name: "Odysee", badge: ["Od", "#ef1970"], web: "https://odysee.com/$/search?q={q}" },
		{ id: "bitchute", g: "video", name: "BitChute", badge: ["Bc", "#ef4137"], web: "https://www.bitchute.com/search?query={q}&kind=video" },
		{ id: "vimeo", g: "video", name: "Vimeo", badge: ["Vi", "#1ab7ea"], web: "https://vimeo.com/search?q={q}" },
		{ id: "dailymotion", g: "video", name: "Dailymotion", badge: ["Dm", "#0066dc"], web: "https://www.dailymotion.com/search/{q}" },
		{ id: "twitch", g: "video", name: "Twitch", badge: ["Tw", "#9146ff"], web: "https://www.twitch.tv/search?term={q}" },
		{ id: "tiktok", g: "video", name: "TikTok", badge: ["Tt", "#222"], web: "https://www.tiktok.com/search?q={q}" },
		{ id: "spotify", g: "video", name: "Spotify", badge: ["Sf", "#1db954", "#06240f"], web: "https://open.spotify.com/search/{q}" },

		{ id: "x", g: "social", name: "X (Twitter)", badge: ["X", "#111"], web: "https://x.com/search?q={q}&src=typed_query", time: {} , note: "Add “&f=live” in a custom engine for Latest." },
		{ id: "reddit", g: "social", name: "Reddit", badge: ["Re", "#ff4500"], web: "https://www.reddit.com/search/?q={q}", time: { d: "&t=day", w: "&t=week", m: "&t=month", y: "&t=year" } },
		{ id: "facebook", g: "social", name: "Facebook", badge: ["f", "#1877f2"], web: "https://www.facebook.com/search/top?q={q}" },
		{ id: "bluesky", g: "social", name: "Bluesky", badge: ["Bs", "#1185fe"], web: "https://bsky.app/search?q={q}" },
		{ id: "threads", g: "social", name: "Threads", badge: ["Th", "#222"], web: "https://www.threads.net/search?q={q}" },
		{ id: "truth", g: "social", name: "Truth Social", badge: ["TS", "#5448ee"], web: "https://truthsocial.com/search?q={q}" },
		{ id: "gab", g: "social", name: "Gab", badge: ["Gb", "#21cf7a", "#06301c"], web: "https://gab.com/search/{q}" },
		{ id: "linkedin", g: "social", name: "LinkedIn", badge: ["in", "#0a66c2"], web: "https://www.linkedin.com/search/results/all/?keywords={q}" },
		{ id: "pinterest", g: "social", name: "Pinterest", badge: ["Pi", "#e60023"], web: "https://www.pinterest.com/search/pins/?q={q}" },
		{ id: "minds", g: "social", name: "Minds", badge: ["Mi", "#fed12f", "#332700"], web: "https://www.minds.com/search?q={q}" },
		{ id: "peakd", g: "social", name: "PeakD (Hive)", badge: ["Hv", "#e31337"], web: "https://peakd.com/search?q={q}" },
		{ id: "substack", g: "social", name: "Substack", badge: ["Su", "#ff6719"], web: "https://substack.com/search/{q}" },
		{ id: "quora", g: "social", name: "Quora", badge: ["Qu", "#b92b27"], web: "https://www.quora.com/search?q={q}" },
		{ id: "medium", g: "social", name: "Medium", badge: ["M", "#222"], web: "https://medium.com/search?q={q}" },
		{ id: "tumblr", g: "social", name: "Tumblr", badge: ["Tu", "#36465d"], web: "https://www.tumblr.com/search/{q}" },
		{ id: "googlenews", g: "social", name: "Google News", badge: ["GN", "#4285f4"], web: "https://news.google.com/search?q={q}" },

		{ id: "wikipedia", g: "ref", name: "Wikipedia", badge: ["W", "#636466"], web: "https://{v}.wikipedia.org/w/index.php?search={q}", variants: V([["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["pt", "Português"], ["it", "Italiano"], ["ru", "Русский"], ["ja", "日本語"], ["zh", "中文"], ["ar", "العربية"]]) },
		{ id: "scholar", g: "ref", name: "Google Scholar", badge: ["Sc", "#4285f4"], web: "https://scholar.google.com/scholar?q={q}" },
		{ id: "pubmed", g: "ref", name: "PubMed", badge: ["Pm", "#20558a"], web: "https://pubmed.ncbi.nlm.nih.gov/?term={q}" },
		{ id: "arxiv", g: "ref", name: "arXiv", badge: ["aX", "#b31b1b"], web: "https://arxiv.org/search/?query={q}&searchtype=all" },
		{ id: "archive", g: "ref", name: "Internet Archive", badge: ["IA", "#444"], web: "https://archive.org/search?query={q}" },
		{ id: "wolfram", g: "ref", name: "Wolfram Alpha", badge: ["Wa", "#dd1100"], web: "https://www.wolframalpha.com/input?i={q}" },
		{ id: "gbooks", g: "ref", name: "Google Books", badge: ["Bk", "#4285f4"], web: "https://www.google.com/search?tbm=bks&q={q}" },
		{ id: "patents", g: "ref", name: "Google Patents", badge: ["Pt", "#4285f4"], web: "https://patents.google.com/?q={q}" },
		{ id: "factcheck", g: "ref", name: "Google Fact Check Explorer", badge: ["FC", "#4285f4"], web: "https://toolbox.google.com/factcheck/explorer/search/{q}" },
		{ id: "maps", g: "ref", name: "Google Maps", badge: ["Mp", "#34a853"], web: "https://www.google.com/maps/search/{q}" },
		{ id: "osm", g: "ref", name: "OpenStreetMap", badge: ["Os", "#5b9e3a"], web: "https://www.openstreetmap.org/search?query={q}" },
		{ id: "amazon", g: "ref", name: "Amazon", badge: ["Az", "#ff9900", "#2b1a00"], web: "https://www.amazon.{v}/s?k={q}", variants: V([["com", ".com"], ["ca", ".ca"], ["co.uk", ".co.uk"], ["de", ".de"], ["fr", ".fr"], ["es", ".es"], ["it", ".it"], ["in", ".in"], ["com.au", ".com.au"], ["co.jp", ".co.jp"]]) },
		{ id: "ebay", g: "ref", name: "eBay", badge: ["eB", "#e53238"], web: "https://www.ebay.com/sch/i.html?_nkw={q}" },
		{ id: "etsy", g: "ref", name: "Etsy", badge: ["Et", "#f1641e"], web: "https://www.etsy.com/search?q={q}" },

		{ id: "trends", g: "dev", name: "Google Trends", badge: ["Tr", "#4285f4"], web: "https://trends.google.com/trends/explore?q={q}" },
		{ id: "hn", g: "dev", name: "Hacker News", badge: ["HN", "#ff6600"], web: "https://hn.algolia.com/?q={q}" },
		{ id: "stackoverflow", g: "dev", name: "Stack Overflow", badge: ["SO", "#f48024"], web: "https://stackoverflow.com/search?q={q}" },
		{ id: "github", g: "dev", name: "GitHub", badge: ["GH", "#24292f"], web: "https://github.com/search?q={q}" }
	];
	var BYID = {}; ENGINES.forEach(function (e) { BYID[e.id] = e; });

	var PRESETS = [
		["main", "Main engines", ["google", "bing", "ddg", "brave", "yahoo"]],
		["privacy", "Privacy engines", ["ddg", "brave", "startpage", "qwant", "mojeek", "swisscows", "metager"]],
		["bias", "Censorship & bias check", ["google", "bing", "ddg", "brave", "yandex", "mojeek", "startpage", "yahoo", "baidu"]],
		["videocheck", "Video censorship check", ["youtube", "rumble", "odysee", "bitchute", "vimeo", "dailymotion", "tiktok"]],
		["seo", "SEO check", ["google", "bing", "ddg", "brave", "yandex", "trends"]],
		["ai", "AI answers", ["perplexity", "chatgpt", "grok", "claude", "copilot", "googleai"]],
		["social", "Social", ["x", "reddit", "facebook", "bluesky", "threads", "truth", "gab", "linkedin"]],
		["research", "Research", ["scholar", "pubmed", "arxiv", "wikipedia", "archive", "gbooks", "factcheck"]],
		["everything", "Everything", ENGINES.map(function (e) { return e.id; })]
	];

	function clean(q) { return String(q == null ? "" : q).replace(/\s+/g, " ").trim(); }
	/* the query text an engine gets, with the operators the page's options add (only to engines flagged ops) */
	function queryFor(e, q, o) {
		o = o || {}; q = clean(q);
		if (!q && !o.site) return "";
		if (!e.ops) return q;
		var s = o.exact && q ? '"' + q.replace(/"/g, "") + '"' : q;
		if (o.site) s = (s ? s + " " : "") + "site:" + clean(o.site).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
		if (o.exclude) s += " -site:" + clean(o.exclude).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
		return s;
	}
	function fill(tpl, q, v) { return tpl.replace(/\{q\}/g, encodeURIComponent(q)).replace(/\{v\}/g, v == null ? "" : v); }
	/* the URL for one engine (and one variant) or null when the engine can't do the chosen type; o: { type: web|images|news|videos, time: ""|d|w|m|y, exact, site, exclude } */
	function url(e, q, o, variant) {
		o = o || {};
		var type = o.type || "web", tpl = type === "web" ? e.web : e.types && e.types[type];
		if (!tpl) return null;
		var qq = queryFor(e, q, o);
		if (!qq) return null;
		var vv = variant ? variant.v : (e.variants && e.variants[0] ? e.variants[0].v : "");
		var u = fill(tpl, qq, vv);
		if (o.time && e.time && e.time[o.time]) u += e.time[o.time];
		return u;
	}
	/* every address to open for the selection: [{ id, name, label, url }] plus the engines skipped for the chosen type.
	 * extra: { engineId: ["images", "news", "videos"] } = ticks on the engine's card that open those searches IN ADDITION to the page-wide type */
	var TYPE_LABEL = { web: "", images: " Images", news: " News", videos: " Videos" };
	function targets(sel, vsel, custom, q, o, extra) {
		var out = [], skipped = [];
		o = o || {};
		sel.forEach(function (id) {
			var e = BYID[id] || (custom || []).filter(function (c) { return c.id === id; })[0]; if (!e) return;
			var vs = e.variants && e.variants.length ? (vsel && vsel[id] && vsel[id].length ? e.variants.filter(function (x) { return vsel[id].indexOf(x.id) >= 0; }) : [e.variants[0]]) : [null];
			var types = [o.type || "web"];
			((extra && extra[id]) || []).forEach(function (t) { if (types.indexOf(t) < 0 && e.types && e.types[t]) types.push(t); });
			var any = false;
			types.forEach(function (t) {
				var oo = {}; for (var k in o) oo[k] = o[k]; oo.type = t;
				vs.forEach(function (v) {
					var u = url(e, q, oo, v);
					if (u) { any = true; out.push({ id: id, name: e.name, type: t, label: e.name + TYPE_LABEL[t] + (v && e.variants.length > 1 ? " " + v.label : ""), url: u }); }
				});
			});
			if (!any && clean(q)) skipped.push(e.name);
		});
		return { list: out, skipped: skipped };
	}
	/* a custom engine's template: accepts {q}, %s or %S */
	function customTemplate(t) { return String(t || "").trim().replace(/%s/gi, "{q}"); }
	function validCustom(t) { return /^https?:\/\/[^\s]+$/i.test(t) && t.indexOf("{q}") >= 0; }
	/* a grid of window rectangles for n windows on a screen of w x h */
	function tile(n, w, h, left, top) {
		var cols = Math.max(1, Math.ceil(Math.sqrt(n * (w / h) * 0.8))), rows = Math.ceil(n / cols), out = [], i;
		cols = Math.min(cols, n); rows = Math.ceil(n / cols);
		for (i = 0; i < n; i++) out.push({ left: Math.round(left + (i % cols) * w / cols), top: Math.round(top + Math.floor(i / cols) * h / rows), width: Math.round(w / cols), height: Math.round(h / rows) });
		return out;
	}
	var api = { GROUPS: GROUPS, ENGINES: ENGINES, BYID: BYID, PRESETS: PRESETS, clean: clean, queryFor: queryFor, url: url, targets: targets, customTemplate: customTemplate, validCustom: validCustom, tile: tile };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESEngines = api;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Search Engines -- mes.fm/search-engines
 * Type one search, tick engines (or pick a set), open them all at once in tabs or tiled windows, or click a single engine link.
 * Engine table + URL builder: lib.js (MESEngines). State: localStorage "mes-search-engines:v1" (ticked engines, Google/Bing/... variants, own engines and sets,
 * options, recent searches). Share links: ?q=&e=google,bing&t=images&w=d&m=tab. Nothing is sent anywhere by this page.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("se");
	if (!root) return;
	var E = window.MESEngines, KEY = "mes-search-engines:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

	var saved = sget(), qs = new URLSearchParams(location.search);
	var S = {
		sel: Array.isArray(saved.sel) ? saved.sel : ["google", "bing", "ddg", "brave", "yahoo"],
		vsel: saved.vsel && typeof saved.vsel === "object" ? saved.vsel : {},
		custom: Array.isArray(saved.custom) ? saved.custom : [],
		sets: Array.isArray(saved.sets) ? saved.sets : [],
		type: saved.type || "web", time: saved.time || "", mode: saved.mode || "tab",
		exact: !!saved.exact, site: saved.site || "", excl: saved.excl || "", log: saved.log !== false, hist: Array.isArray(saved.hist) ? saved.hist : [],
		fold: saved.fold && typeof saved.fold === "object" ? saved.fold : {},
		extra: saved.extra && typeof saved.extra === "object" ? saved.extra : {}
	};
	// a shared link overrides the saved choices for this visit
	if (qs.get("e")) S.sel = qs.get("e").split(",").filter(function (id) { return E.BYID[id]; });
	if (/^(web|images|news|videos)$/.test(qs.get("t") || "")) S.type = qs.get("t");
	if (/^[dwmy]$/.test(qs.get("w") || "")) S.time = qs.get("w");
	if (/^(tab|window|same)$/.test(qs.get("m") || "")) S.mode = qs.get("m");
	if (qs.get("site")) S.site = qs.get("site");
	if (qs.get("x") === "1") S.exact = true;
	if (qs.get("a")) { S.extra = {}; qs.get("a").split(",").forEach(function (p) { var m = p.split(":"); if (E.BYID[m[0]] && m[1]) S.extra[m[0]] = m[1].split("+").filter(function (t) { return /^(images|news|videos)$/.test(t); }); }); }
	if (qs.get("q")) $("se-q").value = qs.get("q");
	function persist() { sset({ sel: S.sel, vsel: S.vsel, custom: S.custom, sets: S.sets, type: S.type, time: S.time, mode: S.mode, exact: S.exact, site: S.site, excl: S.excl, log: S.log, hist: S.hist, fold: S.fold, extra: S.extra }); }

	function all() { return E.ENGINES.concat(S.custom.map(function (c) { return { id: c.id, g: "mine", name: c.name, badge: [c.name.slice(0, 2), "#5a6270"], web: c.web, custom: true }; })); }
	function opts() { return { type: S.type, time: S.time, exact: S.exact, site: S.site, exclude: S.excl }; }
	function q() { return E.clean($("se-q").value); }
	function engineById(id) { return E.BYID[id] || all().filter(function (e) { return e.id === id; })[0]; }
	function tg() { return E.targets(S.sel, S.vsel, S.custom, q(), opts(), S.extra); }
	function hasQuery() { return !!(q() || E.clean(S.site)); }

	/* ---------- toast + clipboard ---------- */
	var toastT;
	function toast(msg) { var t = $("se-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text) {
		if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, fb);
		return Promise.resolve(fb());
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); return ok; }
	}

	/* ---------- render ---------- */
	var filterText = "";
	function cardHtml(e, targets) {
		var on = S.sel.indexOf(e.id) >= 0, na = S.type !== "web" && !(e.types && e.types[S.type]);
		var vs = e.variants && e.variants.length ? (S.vsel[e.id] && S.vsel[e.id].length ? S.vsel[e.id] : [e.variants[0].id]) : null;
		var firstV = vs ? e.variants.filter(function (v) { return v.id === vs[0]; })[0] : null;
		var u = hasQuery() ? E.url(e, q(), opts(), firstV) : null;
		var b = e.badge || [e.name.slice(0, 2), "#5a6270"];
		var h = '<div class="se-card' + (on ? " is-on" : "") + (na ? " is-na" : "") + '" data-id="' + esc(e.id) + '"><div class="se-top"><label class="se-pick"><input type="checkbox" class="se-tick"' + (on ? " checked" : "") + '>' +
			'<span class="se-badge" style="background:' + esc(b[1]) + ";color:" + esc(b[2] || "#fff") + '">' + esc(b[0]) + '</span><span class="se-name" title="' + esc(e.name) + '">' + esc(e.name) + "</span></label>" +
			(e.custom ? '<button type="button" class="se-del" title="Remove this engine" aria-label="Remove ' + esc(e.name) + '">✕</button>' : "") +
			'<a class="se-open' + (u ? "" : " is-off") + '" href="' + (u ? esc(u) : "#") + '" target="' + (S.mode === "same" ? "_self" : "_blank") + '" rel="noopener"' + (u ? "" : ' aria-disabled="true" tabindex="-1"') + ">Open ↗</a></div>";
		if (e.variants && e.variants.length > 1) {
			h += '<div class="se-var" role="group" aria-label="' + esc(e.name) + ' versions">' + e.variants.map(function (v) {
				return '<button type="button" data-v="' + esc(v.id) + '" aria-pressed="' + (vs.indexOf(v.id) >= 0) + '">' + esc(v.label) + "</button>";
			}).join("") + "</div>";
		}
		if (e.types) {
			var ex = S.extra[e.id] || [];
			h += '<div class="se-also" role="group" aria-label="Also search ' + esc(e.name) + ' for"><span>Also:</span>' + ["images", "news", "videos"].filter(function (t) { return e.types[t]; }).map(function (t) {
				return '<button type="button" data-x="' + t + '" aria-pressed="' + (ex.indexOf(t) >= 0) + '" title="Open the ' + esc(e.name) + " " + t + ' search too">' + t.charAt(0).toUpperCase() + t.slice(1) + "</button>";
			}).join("") + "</div>";
		}
		if (na) h += '<div class="se-na">No ' + S.type + " search here</div>";
		else if (e.note) h += '<div class="se-note">' + esc(e.note) + "</div>";
		return h + "</div>";
	}
	function groups() {
		var g = E.GROUPS.slice();
		if (S.custom.length) g.push(["mine", "My own engines", "Engines you added. Saved in this browser."]);
		return g;
	}
	function render() {
		var t = tg(), html = "", list = all(), ft = filterText.toLowerCase();
		groups().forEach(function (g) {
			var items = list.filter(function (e) { return e.g === g[0] && (!ft || e.name.toLowerCase().indexOf(ft) >= 0 || e.id.indexOf(ft) >= 0); });
			if (!items.length) return;
			var n = items.filter(function (e) { return S.sel.indexOf(e.id) >= 0; }).length, folded = !!S.fold[g[0]] && !ft;
			html += '<section class="se-group' + (folded ? " is-folded" : "") + '" data-g="' + g[0] + '"><h2 class="se-gh"><button type="button" class="se-gtoggle" aria-expanded="' + !folded + '"><span class="se-arrow" aria-hidden="true">▼</span>' + esc(g[1]) +
				'</button><button type="button" class="se-gsel" data-g="' + g[0] + '">' + (n === items.length ? "untick group" : "tick group") + '</button><span class="se-gcount">' + n + "/" + items.length + ' ticked</span></h2><div class="se-gbody"><p class="se-gdesc">' + esc(g[2]) + '</p><div class="se-grid">' +
				items.map(function (e) { return cardHtml(e, t); }).join("") + "</div></div></section>";
		});
		if (!html) html = '<p class="tu-note" style="text-align:center;margin:1.5em 0;">No engine matches “' + esc(filterText) + '”.</p>';
		$("se-out").innerHTML = html;
		var nOpen = t.list.length;
		$("se-go").textContent = S.mode === "same" ? "Open first selected" : "Open " + nOpen + (nOpen === 1 ? " engine" : " engines");
		$("se-go").disabled = !hasQuery() || !nOpen;
		$("se-go").title = !hasQuery() ? "Type a search first" : nOpen ? "" : "Tick at least one engine";
		renderPresets(); syncOpts();
	}
	function renderPresets() {
		var cur = S.sel.slice().sort().join(","), h = "";
		E.PRESETS.forEach(function (p) { h += '<button type="button" class="tu-chip" data-p="' + p[0] + '" aria-pressed="' + (p[2].slice().sort().join(",") === cur) + '">' + esc(p[1]) + "</button>"; });
		S.sets.forEach(function (s, i) { h += '<span class="se-myset"><button type="button" class="tu-chip" data-s="' + i + '" aria-pressed="' + (s.ids.slice().sort().join(",") === cur) + '">★ ' + esc(s.name) + '</button></span>'; });
		$("se-presets").innerHTML = h;
	}
	function syncOpts() {
		[["se-type", "t", S.type], ["se-time", "t", S.time], ["se-mode", "m", S.mode]].forEach(function (x) {
			Array.prototype.forEach.call($(x[0]).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset[x[1]] === x[2])); });
		});
		$("se-exact").checked = S.exact; $("se-log").checked = S.log;
		if (document.activeElement !== $("se-site")) $("se-site").value = S.site;
		if (document.activeElement !== $("se-excl")) $("se-excl").value = S.excl;
		$("se-more").open = $("se-more").open || !!(S.site || S.excl || S.exact);
		renderHistory();
	}

	/* ---------- opening ---------- */
	function logSearch() {
		if (!S.log || !q()) return;
		S.hist = S.hist.filter(function (h) { return h.q !== q(); });
		S.hist.unshift({ q: q(), t: Date.now(), n: S.sel.length, ty: S.type });
		S.hist = S.hist.slice(0, 30); persist(); renderHistory();
	}
	function renderHistory() {
		var box = $("se-history"); box.hidden = !S.hist.length;
		$("se-hlist").innerHTML = S.hist.map(function (h, i) {
			var d = new Date(h.t), lbl; try { lbl = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { lbl = ""; }
			return '<li><button type="button" class="se-hq" data-i="' + i + '" title="Search this again">' + esc(h.q) + '</button><span class="se-hm">' + esc(lbl) + "</span></li>";
		}).join("");
	}
	function openAll() {
		if (!hasQuery()) { $("se-q").focus(); return; }
		var t = tg(), list = t.list, warn = $("se-warn"); warn.hidden = true;
		if (!list.length) { toast("Tick at least one engine"); return; }
		if (S.mode === "same") { logSearch(); location.href = list[0].url; return; }
		var blocked = [], rects = null;
		if (S.mode === "window") {
			var sc = window.screen || {}, W = sc.availWidth || window.innerWidth, H = sc.availHeight || window.innerHeight;
			rects = E.tile(list.length, W, H, sc.availLeft || 0, sc.availTop || 0);
		}
		list.forEach(function (x, i) {
			var feat = rects ? "popup=yes,left=" + rects[i].left + ",top=" + rects[i].top + ",width=" + rects[i].width + ",height=" + rects[i].height : "";
			var w = null; try { w = window.open(x.url, rects ? "se-win-" + i : "_blank", feat); } catch (e) {}
			if (w) { try { w.opener = null; } catch (e) {} } else blocked.push(x);
		});
		logSearch();
		var msg = "";
		if (t.skipped.length) msg += "Skipped (no " + S.type + " search): " + esc(t.skipped.join(", ")) + ". ";
		if (blocked.length) {
			msg += "<b>Your browser's pop-up blocker stopped " + blocked.length + " of " + list.length + ".</b> Click to open them, or allow pop-ups for mes.fm (icon in the address bar) and press Open again:<br>" +
				blocked.map(function (x) { return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.label) + " ↗</a>"; }).join("");
		}
		if (msg) { warn.innerHTML = msg; warn.hidden = false; } else toast("Opened " + list.length + (list.length === 1 ? " search" : " searches"));
	}
	$("se-go").onclick = openAll;
	$("se-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); openAll(); } });
	$("se-q").addEventListener("input", function () { $("se-warn").hidden = true; render(); });
	$("se-out").addEventListener("click", function (e) {
		var a = e.target.closest("a.se-open");
		if (a) { if (a.classList.contains("is-off")) { e.preventDefault(); $("se-q").focus(); toast("Type a search first"); } else logSearch(); return; }
		var gt = e.target.closest(".se-gtoggle");
		if (gt) { var g = gt.closest(".se-group").dataset.g; if (S.fold[g]) delete S.fold[g]; else S.fold[g] = 1; persist(); render(); return; }
		var gs = e.target.closest(".se-gsel");
		if (gs) {
			var ids = all().filter(function (x) { return x.g === gs.dataset.g; }).map(function (x) { return x.id; }), allOn = ids.every(function (id) { return S.sel.indexOf(id) >= 0; });
			S.sel = S.sel.filter(function (id) { return ids.indexOf(id) < 0; }); if (!allOn) S.sel = S.sel.concat(ids);
			persist(); render(); return;
		}
		var xb = e.target.closest(".se-also button");
		if (xb) {
			var xid = xb.closest(".se-card").dataset.id, cur2 = S.extra[xid] ? S.extra[xid].slice() : [], t2 = xb.dataset.x, k2 = cur2.indexOf(t2);
			if (k2 >= 0) cur2.splice(k2, 1); else cur2.push(t2);
			if (cur2.length) S.extra[xid] = cur2; else delete S.extra[xid];
			if (cur2.length && S.sel.indexOf(xid) < 0) S.sel.push(xid);
			persist(); render(); return;
		}
		var vb = e.target.closest(".se-var button");
		if (vb) {
			var id = vb.closest(".se-card").dataset.id, e0 = engineById(id), cur = S.vsel[id] && S.vsel[id].length ? S.vsel[id].slice() : [e0.variants[0].id], v = vb.dataset.v, k = cur.indexOf(v);
			if (k >= 0) { if (cur.length > 1) cur.splice(k, 1); } else cur.push(v);
			S.vsel[id] = cur; if (S.sel.indexOf(id) < 0) S.sel.push(id);
			persist(); render(); return;
		}
		var del = e.target.closest(".se-del");
		if (del) { var did = del.closest(".se-card").dataset.id; S.custom = S.custom.filter(function (c) { return c.id !== did; }); S.sel = S.sel.filter(function (x) { return x !== did; }); persist(); render(); toast("Engine removed"); }
	});
	$("se-out").addEventListener("change", function (e) {
		if (!e.target.classList.contains("se-tick")) return;
		var id = e.target.closest(".se-card").dataset.id, k = S.sel.indexOf(id);
		if (e.target.checked && k < 0) S.sel.push(id); else if (!e.target.checked && k >= 0) S.sel.splice(k, 1);
		persist(); render();
	});

	/* ---------- options ---------- */
	function seg(id, key, attr) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S[key] = b.dataset[attr]; persist(); render(); }); }
	seg("se-type", "type", "t"); seg("se-time", "time", "t"); seg("se-mode", "mode", "m");
	$("se-exact").onchange = function () { S.exact = this.checked; persist(); render(); };
	$("se-log").onchange = function () { S.log = this.checked; if (!S.log) S.hist = []; persist(); render(); };
	$("se-site").addEventListener("input", function () { S.site = this.value.trim(); persist(); render(); });
	$("se-excl").addEventListener("input", function () { S.excl = this.value.trim(); persist(); render(); });
	$("se-filter").addEventListener("input", function () { filterText = this.value.trim(); render(); });
	$("se-presets").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.p) { var p = E.PRESETS.filter(function (x) { return x[0] === b.dataset.p; })[0]; S.sel = p[2].slice(); }
		else if (b.dataset.s) { var s = S.sets[+b.dataset.s]; if (e.shiftKey && confirm("Delete your set “" + s.name + "”?")) S.sets.splice(+b.dataset.s, 1); else S.sel = s.ids.filter(function (id) { return engineById(id); }); }
		persist(); render();
	});
	$("se-selall").onclick = function () {
		var ft = filterText.toLowerCase(), ids = all().filter(function (e) { return !ft || e.name.toLowerCase().indexOf(ft) >= 0; }).map(function (e) { return e.id; });
		ids.forEach(function (id) { if (S.sel.indexOf(id) < 0) S.sel.push(id); }); persist(); render();
	};
	$("se-none").onclick = function () { S.sel = []; persist(); render(); };
	$("se-saveset").onclick = function () {
		if (!S.sel.length) { toast("Tick some engines first"); return; }
		var name = prompt("Name for this set of " + S.sel.length + " engines:\n(Shift-click a saved set later to delete it.)", ""); if (!name || !name.trim()) return;
		name = name.trim().slice(0, 30); S.sets = S.sets.filter(function (s) { return s.name !== name; }); S.sets.push({ name: name, ids: S.sel.slice() }); persist(); render(); toast("Saved set “" + name + "”");
	};
	$("se-copylinks").onclick = function () {
		var t = tg(); if (!t.list.length) { toast(hasQuery() ? "Tick some engines first" : "Type a search first"); return; }
		copy(t.list.map(function (x) { return x.label + ": " + x.url; }).join("\n")).then(function (ok) { toast(ok ? "Copied " + t.list.length + " links" : "Copy failed"); });
	};
	$("se-sharelink").onclick = function () {
		var p = new URLSearchParams(); if (q()) p.set("q", q()); p.set("e", S.sel.join(","));
		if (S.type !== "web") p.set("t", S.type); if (S.time) p.set("w", S.time); if (S.mode !== "tab") p.set("m", S.mode); if (S.site) p.set("site", S.site); if (S.exact) p.set("x", "1");
		var ax = Object.keys(S.extra).filter(function (id) { return S.sel.indexOf(id) >= 0 && S.extra[id].length; }).map(function (id) { return id + ":" + S.extra[id].join("+"); }); if (ax.length) p.set("a", ax.join(","));
		copy(location.origin + location.pathname + "?" + p.toString()).then(function (ok) { toast(ok ? "Share link copied" : "Copy failed"); });
	};

	/* ---------- history ---------- */
	$("se-hlist").addEventListener("click", function (e) { var b = e.target.closest(".se-hq"); if (!b) return; $("se-q").value = S.hist[+b.dataset.i].q; render(); $("se-q").focus(); window.scrollTo({ top: root.getBoundingClientRect().top + window.pageYOffset - 20, behavior: "smooth" }); });
	$("se-hclear").onclick = function () { S.hist = []; persist(); renderHistory(); };

	/* ---------- own engines ---------- */
	$("se-cadd").onclick = function () {
		var name = $("se-cname").value.trim(), tpl = E.customTemplate($("se-curl").value), m = $("se-cmsg");
		m.classList.remove("is-err");
		if (!name) { m.textContent = "Give the engine a name."; m.classList.add("is-err"); return; }
		if (!E.validCustom(tpl)) { m.textContent = "The address must start with http:// or https:// and contain %s where the search words go."; m.classList.add("is-err"); return; }
		var id = "c" + Date.now().toString(36); S.custom.push({ id: id, name: name, web: tpl }); S.sel.push(id);
		$("se-cname").value = ""; $("se-curl").value = ""; m.textContent = "Added “" + name + "” and ticked it."; persist(); render();
	};
	$("se-export").onclick = function () {
		var blob = new Blob([JSON.stringify({ v: 1, custom: S.custom, sets: S.sets, sel: S.sel, vsel: S.vsel }, null, 1)], { type: "application/json" }), a = document.createElement("a");
		a.href = URL.createObjectURL(blob); a.download = "mes-search-engines-backup.json"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 400);
	};
	$("se-import").onclick = function () { $("se-file").click(); };
	$("se-file").onchange = function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		var r = new FileReader();
		r.onload = function () {
			try {
				var d = JSON.parse(r.result), n = 0;
				(d.custom || []).forEach(function (c) { if (c && c.name && E.validCustom(c.web) && !S.custom.some(function (x) { return x.web === c.web; })) { S.custom.push({ id: "c" + Date.now().toString(36) + n, name: String(c.name).slice(0, 40), web: c.web }); n++; } });
				(d.sets || []).forEach(function (s) { if (s && s.name && Array.isArray(s.ids) && !S.sets.some(function (x) { return x.name === s.name; })) { S.sets.push({ name: String(s.name).slice(0, 30), ids: s.ids.filter(function (id) { return engineById(id); }) }); n++; } });
				persist(); render(); toast(n ? "Restored " + n + " items" : "Nothing new in that file");
			} catch (e) { toast("That doesn't look like a backup file"); }
		};
		r.readAsText(f);
	};

	render();
	if (!q()) $("se-q").focus({ preventScroll: true });
})();
