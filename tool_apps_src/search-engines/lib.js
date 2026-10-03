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
	/* every address to open for the selection: [{ id, name, label, url }] plus the engines skipped for the chosen type */
	function targets(sel, vsel, custom, q, o) {
		var out = [], skipped = [];
		sel.forEach(function (id) {
			var e = BYID[id] || (custom || []).filter(function (c) { return c.id === id; })[0]; if (!e) return;
			var vs = e.variants && e.variants.length ? (vsel && vsel[id] && vsel[id].length ? e.variants.filter(function (x) { return vsel[id].indexOf(x.id) >= 0; }) : [e.variants[0]]) : [null];
			var any = false;
			vs.forEach(function (v) {
				var u = url(e, q, o, v);
				if (u) { any = true; out.push({ id: id, name: e.name, label: e.name + (v && e.variants.length > 1 ? " " + v.label : ""), url: u }); }
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
