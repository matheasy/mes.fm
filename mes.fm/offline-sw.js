/* MES offline copies (2026-11-25). One service worker file for every page that works with no server: main_js/offline.js registers
   "/offline-sw.js?p=/<page>" with scope "/<page>" (the list is OFFLINE_PAGES in main_js/site-search.js). mes.fm/solitaire has its own
   solitaire-sw.js (same idea). What it does:
   - install: fetch the page and every same-origin script / stylesheet / picture / data file it links into one shared cache.
   - visits to the page: network first (a new version shows when online), the saved copy when offline.
   - same-origin files the page asks for later (sounds, data, pictures): saved copy at once, refreshed in the background.
   - libraries from cdnjs / jsDelivr / unpkg and Google Fonts: same, so e.g. MathJax or pdf.js work offline once used online.
   - /api/ is never cached. Pages under the same prefix (e.g. /timer/inspirational-quotes under /timer) are left alone.
   Bump VERSION to drop every old copy. */
var VERSION = "mes-off-v1";
var PAGE = (new URL(self.location.href).searchParams.get("p") || "").replace(/\/+$/, "");
var CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

function norm(path) { return path.replace(/\/index\.html$/, "").replace(/\.html$/, "").replace(/\/+$/, "") || "/"; }
function same(u) { try { return new URL(u, self.location.href).origin === self.location.origin; } catch (e) { return false; } }
/** a redirected response cannot answer a page visit, so store a plain copy */
function clean(res) {
	if (!res.redirected) return Promise.resolve(res);
	return res.blob().then(function (b) { return new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }); });
}

self.addEventListener("install", function (e) {
	if (!/^\/[a-z0-9-]+$/.test(PAGE)) return;
	e.waitUntil(caches.open(VERSION).then(function (cache) {
		return fetch(PAGE, { cache: "reload" }).then(function (res) {
			if (!res.ok) return;
			var copy = res.clone();
			return res.text().then(function (html) {
				return clean(copy).then(function (c) { return cache.put(PAGE, c); }).then(function () {
					var urls = {}, re = /(?:src|href)=["']([^"'#]+)["']/g, m;
					while ((m = re.exec(html))) {
						var u;
						try { u = new URL(m[1], self.location.origin + PAGE + "/"); } catch (er) { continue; }
						if (u.origin !== self.location.origin || /^\/api\//.test(u.pathname)) continue;
						if (!/\.(js|css|png|jpe?g|webp|gif|svg|ico|woff2?|json|mp3|ogg)$/i.test(u.pathname)) continue;
						urls[u.href] = 1;
					}
					return Promise.all(Object.keys(urls).map(function (u) { return cache.add(u).catch(function () {}); }));
				});
			});
		});
	}).catch(function () {}).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
	e.waitUntil(caches.keys().then(function (keys) {
		return Promise.all(keys.filter(function (k) { return /^mes-off-/.test(k) && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
	}).then(function () { return self.clients.claim(); }));
});

function staleWhileRevalidate(req) {
	return caches.open(VERSION).then(function (cache) {
		return cache.match(req).then(function (hit) {
			var net = fetch(req).then(function (res) { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
			return hit || net;
		});
	});
}

self.addEventListener("fetch", function (e) {
	var req = e.request;
	if (req.method !== "GET" || !PAGE) return;
	var url = new URL(req.url);
	if (req.mode === "navigate") {
		if (!same(req.url) || norm(url.pathname) !== PAGE) return;          // another page under the same prefix
		e.respondWith(fetch(req).then(function (res) {
			if (res.ok) { var c = res.clone(); clean(c).then(function (cc) { return caches.open(VERSION).then(function (cache) { return cache.put(PAGE, cc); }); }); }
			return res;
		}).catch(function () { return caches.match(PAGE); }));
		return;
	}
	if (same(req.url)) {
		if (/^\/api\//.test(url.pathname)) return;
		var ref = req.referrer ? new URL(req.referrer) : null;
		if (ref && ref.origin === self.location.origin && !/\.[a-z0-9]+$/i.test(ref.pathname) && norm(ref.pathname) !== PAGE) return;   // asked for by another page
		e.respondWith(staleWhileRevalidate(req));
		return;
	}
	if (CDN.test(req.url)) e.respondWith(staleWhileRevalidate(req));
});
