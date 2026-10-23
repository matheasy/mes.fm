/* MES Site Rank service worker: only does anything when the person ticked "show the rank on the toolbar icon" and allowed the optional tabs permission. */
importScripts('shared.js');
var S = MESST, api = chrome, TTL = 6 * 3600 * 1000;
function paint(tabId, b) { api.action.setBadgeText({ tabId: tabId, text: b ? b.text : '' }); if (b) { api.action.setBadgeBackgroundColor({ tabId: tabId, color: b.color }); api.action.setTitle({ tabId: tabId, title: b.title }); } }
function lookup(host) {
	return api.storage.local.get({ cache: {} }).then(function (o) {
		var c = o.cache[host]; if (c && Date.now() - c.t < TTL) return c.res;
		return fetch(S.API + encodeURIComponent(host)).then(function (r) { return r.json(); }).then(function (res) {
			if (res && res.rank && !res.rank.unavailable) { var keys = Object.keys(o.cache); if (keys.length > 300) delete o.cache[keys[0]]; o.cache[host] = { t: Date.now(), res: { apex: res.apex, rank: { ranked: res.rank.ranked, rank: res.rank.rank } } }; api.storage.local.set({ cache: o.cache }); }
			return res;
		});
	});
}
function update(tab) {
	if (!tab || !tab.url) return;
	api.storage.local.get({ auto: false }, function (o) {
		if (!o.auto) return; var host = S.hostFromUrl(tab.url); if (!host) return paint(tab.id, null);
		lookup(host).then(function (res) { paint(tab.id, S.badge(res)); }).catch(function () {});
	});
}
api.tabs.onUpdated.addListener(function (id, change, tab) { if (change.status === 'complete') update(tab); });
api.tabs.onActivated.addListener(function (i) { api.tabs.get(i.tabId, update); });
