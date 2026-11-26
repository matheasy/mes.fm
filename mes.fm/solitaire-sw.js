/* MES Solitaire offline copy (mes.fm/solitaire only: registered with scope "/solitaire" by tool_apps_src/solitaire/app.js).
   Install: fetch the page, then every same-origin script / stylesheet / picture it links, into one cache.
   Page visits: network first (so a new version shows when online), the saved copy when offline.
   Same-origin files: the saved copy at once, refreshed in the background. /api/ and other sites are never cached.
   Bump VERSION to drop old copies. */
var VERSION = "sol-v2";
var PAGE = "/solitaire";

/** a redirected response cannot answer a page visit, so store a plain copy of it */
function clean(res) {
	if (!res.redirected) return Promise.resolve(res);
	return res.blob().then(function (b) { return new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }); });
}
function sameOrigin(u) { try { return new URL(u, self.location.href).origin === self.location.origin; } catch (e) { return false; } }

self.addEventListener("install", function (e) {
	e.waitUntil(caches.open(VERSION).then(function (cache) {
		return fetch(PAGE, { cache: "reload" }).then(function (res) {
			if (!res.ok) return;
			var copy = res.clone();
			return res.text().then(function (html) {
				return clean(copy).then(function (c) { copy = c; return html; });
			}).then(function (html) {
				var urls = {}, re = /(?:src|href)=["']([^"'#]+)["']/g, m;
				while ((m = re.exec(html))) {
					var u = m[1];
					if (!sameOrigin(u) || /^\/api\//.test(new URL(u, self.location.href).pathname)) continue;
					if (!/\.(js|css|png|jpe?g|webp|svg|ico|woff2?|json)(\?|$)/i.test(u)) continue;
					urls[new URL(u, self.location.href).href] = 1;
				}
				return cache.put(PAGE, copy).then(function () {
					return Promise.all(Object.keys(urls).map(function (u) { return cache.add(u).catch(function () {}); }));
				});
			});
		});
	}).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
	e.waitUntil(caches.keys().then(function (keys) {
		return Promise.all(keys.filter(function (k) { return /^sol-/.test(k) && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
	}).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
	var req = e.request;
	if (req.method !== "GET" || !sameOrigin(req.url)) return;
	var url = new URL(req.url);
	if (/^\/api\//.test(url.pathname)) return;
	if (req.mode === "navigate") {
		e.respondWith(fetch(req).then(function (res) {
			if (res.ok && /^\/solitaire\/?$/.test(url.pathname)) { var c = res.clone(); clean(c).then(function (cc) { return caches.open(VERSION).then(function (cache) { return cache.put(PAGE, cc); }); }); }
			return res;
		}).catch(function () { return caches.match(PAGE); }));
		return;
	}
	e.respondWith(caches.open(VERSION).then(function (cache) {
		return cache.match(req).then(function (hit) {
			var net = fetch(req).then(function (res) { if (res.ok) cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
			return hit || net;
		});
	}));
});
