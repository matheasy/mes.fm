/* MES Site Rank popup: looks up the current tab's domain (the click grants activeTab) and shows rank, tier and the 30-day line. */
(function () {
	'use strict';
	var S = MESST, $ = function (id) { return document.getElementById(id); }, api = typeof browser !== 'undefined' ? browser : chrome;
	function say(t) { $('note').textContent = t || ''; }
	function show(host, res) {
		var r = res.rank; $('host').textContent = res.apex + (res.apex !== host ? ' (rank of the whole domain; you are on ' + host + ')' : '');
		$('full').href = S.REPORT + encodeURIComponent(host); $('full').hidden = false;
		if (r.unavailable) return say('The rank service is busy. Try again in a minute.');
		$('out').hidden = false;
		if (!r.ranked) { $('rank').textContent = 'Unranked'; $('tier').textContent = 'Not in the Tranco list'; return say('Small or new sites are often missing. That says "small", not "bad".'); }
		var t = S.tier(r.rank); $('rank').textContent = '#' + S.fmt(r.rank); $('tier').textContent = t.label; $('tier').style.color = t.color;
		var d = S.spark(r.history, 300, 70, 4); if (d) { $('chart').hidden = false; $('line').setAttribute('d', d); $('line').setAttribute('stroke', t.color); }
		var tr = S.trend(r.history); $('trend').textContent = tr ? (tr.dir === 'steady' ? 'Steady' : tr.dir === 'rising' ? 'Climbing' : 'Dropping') + ' over ' + tr.days + ' days (' + (tr.pct > 0 ? '+' : '') + tr.pct.toFixed(0) + '%)' : '';
		if (res.shared) say(res.apex + ' is a shared platform: this is the rank of the whole platform, not of this page or account.');
	}
	api.tabs.query({ active: true, currentWindow: true }, function (tabs) {
		var host = tabs && tabs[0] && S.hostFromUrl(tabs[0].url);
		if (!host) { $('host').textContent = 'No website here'; return say('Open a normal website (http or https) and click again.'); }
		$('host').textContent = host; say('Looking up…');
		fetch(S.API + encodeURIComponent(host)).then(function (r) { return r.json(); }).then(function (j) { say(''); if (j.error) return say(j.error); show(host, j); })
			.catch(function () { say('Could not reach mes.fm. Check your connection.'); });
	});
	/* auto badge: needs the optional "tabs" permission (read the address of the tab you visit), asked only when ticked */
	api.storage.local.get({ auto: false }, function (o) { $('auto').checked = !!o.auto; });
	$('auto').onchange = function () {
		var on = $('auto').checked;
		if (!on) return api.storage.local.set({ auto: false });
		api.permissions.request({ permissions: ['tabs'] }, function (ok) { $('auto').checked = !!ok; api.storage.local.set({ auto: !!ok }); if (!ok) say('Permission not granted, so the badge stays off.'); });
	};
})();
