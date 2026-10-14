/* MES Reverse Image Search: engine table + URL builder (no DOM; node-testable via require). Exposed as window.MESImgSearch.
 * An engine: { id, name, g (group), badge: [text, bg, fg?], home: the site's own page, opened when the image is pasted there, url: template with {u} (the URL-encoded image link), up: { action, field } when the site accepts a file POSTed
 * straight from another page (only sites verified to do so), note }. Sites that block cross-site uploads (Google Lens answers 403, TinEye 405) take a link, or the
 * image pasted with Ctrl+V after the page opens: the app copies the image to the clipboard for that. */
(function (root) {
	"use strict";
	var GROUPS = [
		["general", "General reverse image search", "Find where a picture appears, bigger versions, and what it shows."],
		["original", "Find the original & check copies", "Who posted it first, and where else it has been reused."],
		["art", "Art, anime & illustration", "Sources for artwork, anime screenshots and fan art."],
		["info", "Metadata", "Camera, date and location data hidden inside a photo."]
	];
	var ENGINES = [
		{ id: "lens", home: "https://lens.google.com/", g: "general", name: "Google Lens", badge: ["G", "#4285f4"], url: "https://lens.google.com/uploadbyurl?url={u}", note: "Matches, objects, text, products and places. Also reads text in the picture." },
		{ id: "bing", home: "https://www.bing.com/visualsearch", g: "general", name: "Bing Visual Search", badge: ["B", "#008373"], url: "https://www.bing.com/images/search?view=detailv2&iss=sbi&FORM=SBIHMP&sbisrc=UrlPaste&q=imgurl:{u}", note: "Good for products, landmarks and similar pictures." },
		{ id: "yandex", home: "https://yandex.com/images/", g: "general", name: "Yandex Images", badge: ["Ya", "#fc3f1d"], url: "https://yandex.com/images/search?rpt=imageview&url={u}", note: "Often the best for finding the same picture on other sites. May ask for a captcha." },
		{ id: "baidu", home: "https://graph.baidu.com/pcpage/index?tpl_from=pc", g: "general", name: "Baidu", badge: ["百", "#2932e1"], url: "https://graph.baidu.com/details?isfromtusoupc=1&tn=pc&carousel=0&promotion_name=pc_image_shituindex&image={u}", note: "Strong for pictures that appear on Chinese-language sites." },
		{ id: "sogou", home: "https://pic.sogou.com/", g: "general", name: "Sogou", badge: ["So", "#fb6c00"], url: "https://pic.sogou.com/ris?query={u}&flag=1&drag=0", note: "Another Chinese search engine with image matching." },
		{ id: "tineye", home: "https://tineye.com/", g: "original", name: "TinEye", badge: ["Ti", "#1a8fbf"], url: "https://tineye.com/search?url={u}", note: "The classic: exact and edited copies, oldest and biggest versions. Sort by 'Oldest' to find the original." },
		{ id: "saucenao", home: "https://saucenao.com/", g: "art", name: "SauceNAO", badge: ["Sa", "#6a4c93"], url: "https://saucenao.com/search.php?url={u}", up: { action: "https://saucenao.com/search.php", field: "file" }, note: "Artwork, manga and anime. Accepts a file directly from this page." },
		{ id: "iqdb", home: "https://iqdb.org/", g: "art", name: "IQDB", badge: ["Iq", "#d24d57"], url: "https://iqdb.org/?url={u}", up: { action: "https://iqdb.org/", field: "file" }, note: "Searches Danbooru, Gelbooru, Pixiv and others at once. Accepts a file directly." },
		{ id: "tracemoe", home: "https://trace.moe/", g: "art", name: "trace.moe", badge: ["Tm", "#2e86de"], url: "https://trace.moe/?url={u}", note: "Which anime episode and minute a screenshot is from." },
		{ id: "ascii2d", home: "https://ascii2d.net/", g: "art", name: "ascii2d", badge: ["A2", "#3d3d3d"], url: "https://ascii2d.net/search/url/{u}", note: "Finds Pixiv / Twitter artwork even when it is cropped or recoloured." },
		{ id: "exif", home: "https://exif.regex.info/exif.cgi", g: "info", name: "Jeffrey's Exif Viewer", badge: ["Ex", "#5b7c99"], url: "http://exif.regex.info/exif.cgi?imgurl={u}", note: "Camera model, date taken and GPS location, if the file still has it." }
	];
	var SETS = [
		["popular", "Popular", ["lens", "bing", "yandex", "tineye"]],
		["original", "Find the original", ["tineye", "yandex", "lens", "baidu"]],
		["art", "Art & anime", ["saucenao", "iqdb", "tracemoe", "ascii2d", "yandex"]],
		["all", "Everything", ENGINES.map(function (e) { return e.id; })]
	];
	function isImageUrl(s) { return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test((s || "").trim()); }
	/* Turn what a person pasted into a clean link: trims, adds https:// to a bare "example.com/a.jpg", unwraps a Google / Bing "imgurl=" redirect. */
	function cleanLink(s) {
		s = (s || "").trim().replace(/^["'<]+|["'>]+$/g, "");
		if (!s) return "";
		if (/^\/\//.test(s)) s = "https:" + s;
		if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[^\s/]+\.[^\s/]{2,}\//.test(s)) s = "https://" + s;
		var m = /[?&](?:imgurl|mediaurl|image_url)=([^&]+)/i.exec(s);
		if (m) { try { var d = decodeURIComponent(m[1]); if (/^https?:\/\//i.test(d)) s = d; } catch (e) {} }
		return s;
	}
	function build(engine, link) { return engine.url.replace(/\{u\}/g, encodeURIComponent(link)); }
	/* A custom engine's template may use {u} (encoded link), {raw} (as typed) or %s (encoded link). */
	function customUrl(tpl, link) { return tpl.replace(/\{u\}|%s/g, encodeURIComponent(link)).replace(/\{raw\}/g, link); }
	function validTemplate(t) { return /^https?:\/\//i.test(t || "") && /\{u\}|%s|\{raw\}/.test(t); }
	function byId(id) { for (var i = 0; i < ENGINES.length; i++) if (ENGINES[i].id === id) return ENGINES[i]; return null; }
	root.MESImgSearch = { GROUPS: GROUPS, ENGINES: ENGINES, SETS: SETS, isImageUrl: isImageUrl, cleanLink: cleanLink, build: build, customUrl: customUrl, validTemplate: validTemplate, byId: byId };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESImgSearch;
})(typeof window !== "undefined" ? window : globalThis);
