/* MES Elections: pure data, parsing and seat maths (no DOM, no network). Used by the page (window.MESElect) AND by the aggregator
   mes.fm/api/elections.js, which requires a byte-identical copy at mes.fm/api/_elections-lib.js (the tests check: after editing this
   file run `cp tool_apps_src/elections/lib.js mes.fm/api/_elections-lib.js`). Tests: node tool_apps_src/elections-tests.js.
   Neutral by design: party colours are each party's usual colour, no forecast of our own (market prices are shown as the markets' own
   prices), no adjectives about parties or candidates. Hand-entered facts carry a source and the CHECKED date. */
(function (root) {
	'use strict';
	var E = {};
	E.CHECKED = '2026-10-27';

	// ---------- helpers ----------
	function num(x) { if (x === null || x === undefined || x === '') return null; var n = +x; return isFinite(n) ? n : null; }
	function round(x, d) { if (x === null || x === undefined || !isFinite(x)) return null; var k = Math.pow(10, d == null ? 1 : d); return Math.round(x * k) / k; }
	E.num = num; E.round = round;
	function jsonArr(x) { if (Array.isArray(x)) return x; try { var a = JSON.parse(x); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
	E.fmt = function (v, d) { if (v === null || v === undefined || !isFinite(v)) return '–'; return (+v).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
	E.pct = function (v, d) { return v === null || v === undefined || !isFinite(v) ? '–' : (v < 1 && v > 0 && !d ? '<1' : E.fmt(v, d == null ? 0 : d)) + '%'; };
	E.countdown = function (ms) {
		if (!(ms > 0)) return '0s';
		var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
		if (d >= 60) return d + ' days';
		if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
		return (h ? h + 'h ' : '') + m + 'm ' + ss + 's';
	};
	E.daysUntil = function (ymd, now) { var t = Date.parse(ymd + 'T00:00:00Z'); return isFinite(t) ? Math.ceil((t - (now == null ? Date.now() : now)) / 864e5) : null; };

	// ---------- US 2026 midterms: hand-entered facts (checked 2026-10-27) ----------
	// Election Day: Tuesday 3 November 2026. Polls first close at 6 pm Eastern (parts of Indiana and Kentucky) = 23:00 UTC.
	E.US_DAY = '2026-11-03';
	E.US_FIRST_CLOSE = Date.UTC(2026, 10, 3, 23, 0, 0);
	E.US_START = Date.UTC(2026, 10, 3, 9, 0, 0); // 4 am Eastern: the first polls open around 5-6 am local
	E.STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
	E.ABBR = {}; Object.keys(E.STATES).forEach(function (k) { E.ABBR[E.STATES[k].toLowerCase()] = k; });
	// House seats per state (2020 apportionment, 435)
	E.APPORTION = { AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14, HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8, MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12, NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7, SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1 };
	// tile-grid map: [column, row] (12 x 8)
	E.TILES = { AK: [0, 0], ME: [11, 0], WI: [6, 1], VT: [10, 1], NH: [11, 1], WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], MI: [7, 2], NY: [9, 2], MA: [10, 2], OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3], RI: [11, 3], CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4], AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5], OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6], HI: [0, 7], TX: [4, 7], FL: [9, 7] };

	// Sources: Wikipedia "2026 United States Senate elections" + Ballotpedia, House Clerk (clerk.house.gov), 2026 gubernatorial elections; checked 2026-10-27.
	E.SOURCES_US = [
		['US Senate elections, 2026 (Wikipedia)', 'https://en.wikipedia.org/wiki/2026_United_States_Senate_elections'],
		['US Senate elections, 2026 (Ballotpedia)', 'https://ballotpedia.org/United_States_Senate_elections,_2026'],
		['House membership and vacancies (Office of the Clerk)', 'https://clerk.house.gov/Members'],
		['Governor elections, 2026 (Wikipedia)', 'https://en.wikipedia.org/wiki/2026_United_States_gubernatorial_elections'],
		['2025-26 redistricting (Wikipedia)', 'https://en.wikipedia.org/wiki/2025%E2%80%932026_United_States_redistricting']
	];
	// Senate now: R 53, D 45, I 2 (Sanders, King; both caucus with the Democrats). Ties: the Vice President (JD Vance, R).
	// Not on the ballot in 2026: R 31, D 32, I 2.  On the ballot: 35 (33 regular Class 2 + Ohio and Florida specials), held R 22, D 13.
	E.SENATE = { total: 100, now: { R: 53, D: 45, I: 2 }, hold: { R: 31, D: 32, I: 2 }, holdICaucus: 'D', vp: 'R', vpName: 'JD Vance' };
	// [state, incumbent, party, status, special]
	E.SENATE_2026 = [
		['AL', 'Tommy Tuberville', 'R', 'Not running (running for governor)', 0], ['AK', 'Dan Sullivan', 'R', 'Running', 0], ['AR', 'Tom Cotton', 'R', 'Running', 0],
		['CO', 'John Hickenlooper', 'D', 'Running', 0], ['DE', 'Chris Coons', 'D', 'Running', 0], ['FL', 'Ashley Moody', 'R', 'Running (appointed 2025)', 1],
		['GA', 'Jon Ossoff', 'D', 'Running', 0], ['ID', 'Jim Risch', 'R', 'Running', 0], ['IL', 'Dick Durbin', 'D', 'Not running', 0],
		['IA', 'Joni Ernst', 'R', 'Not running', 0], ['KS', 'Roger Marshall', 'R', 'Running', 0], ['KY', 'Mitch McConnell', 'R', 'Not running', 0],
		['LA', 'Bill Cassidy', 'R', 'Lost the primary', 0], ['ME', 'Susan Collins', 'R', 'Running', 0], ['MA', 'Ed Markey', 'D', 'Running', 0],
		['MI', 'Gary Peters', 'D', 'Not running', 0], ['MN', 'Tina Smith', 'D', 'Not running', 0], ['MS', 'Cindy Hyde-Smith', 'R', 'Running', 0],
		['MT', 'Steve Daines', 'R', 'Not running', 0], ['NE', 'Pete Ricketts', 'R', 'Running', 0], ['NH', 'Jeanne Shaheen', 'D', 'Not running', 0],
		['NJ', 'Cory Booker', 'D', 'Running', 0], ['NM', 'Ben Ray Luján', 'D', 'Running', 0], ['NC', 'Thom Tillis', 'R', 'Not running', 0],
		['OH', 'Jon Husted', 'R', 'Running (appointed 2025)', 1], ['OK', 'Alan Armstrong', 'R', 'Not running (appointed 2026)', 0], ['OR', 'Jeff Merkley', 'D', 'Running', 0],
		['RI', 'Jack Reed', 'D', 'Running', 0], ['SC', 'Darline Graham', 'R', 'Running (appointed 2026)', 0], ['SD', 'Mike Rounds', 'R', 'Running', 0],
		['TN', 'Bill Hagerty', 'R', 'Running', 0], ['TX', 'John Cornyn', 'R', 'Lost the primary', 0], ['VA', 'Mark Warner', 'D', 'Running', 0],
		['WV', 'Shelley Moore Capito', 'R', 'Running', 0], ['WY', 'Cynthia Lummis', 'R', 'Not running', 0]
	];
	// House now (Clerk, 2026-10-27): R 218, D 214, I 1 (Kevin Kiley, CA-03), 2 vacant (FL-20, TX-23). All 435 seats are on the ballot; 218 is a majority.
	E.HOUSE = { total: 435, majority: 218, now: { R: 218, D: 214, I: 1, V: 2 } };
	// Governors now: R 26, D 24. 36 races: held R 18, D 18; not on the ballot (DE IN KY LA MS MO MT NJ NC ND UT VA WA WV): R 8, D 6.
	E.GOV = { total: 50, now: { R: 26, D: 24 }, hold: { R: 8, D: 6 } };
	E.GOV_2026 = [
		['AL', 'Kay Ivey', 'R', 'Term-limited'], ['AK', 'Mike Dunleavy', 'R', 'Term-limited'], ['AZ', 'Katie Hobbs', 'D', 'Running'], ['AR', 'Sarah Huckabee Sanders', 'R', 'Running'],
		['CA', 'Gavin Newsom', 'D', 'Term-limited'], ['CO', 'Jared Polis', 'D', 'Term-limited'], ['CT', 'Ned Lamont', 'D', 'Running'], ['FL', 'Ron DeSantis', 'R', 'Term-limited'],
		['GA', 'Brian Kemp', 'R', 'Term-limited'], ['HI', 'Josh Green', 'D', 'Running'], ['ID', 'Brad Little', 'R', 'Running'], ['IL', 'JB Pritzker', 'D', 'Running'],
		['IA', 'Kim Reynolds', 'R', 'Not running'], ['KS', 'Laura Kelly', 'D', 'Term-limited'], ['ME', 'Janet Mills', 'D', 'Term-limited'], ['MD', 'Wes Moore', 'D', 'Running'],
		['MA', 'Maura Healey', 'D', 'Running'], ['MI', 'Gretchen Whitmer', 'D', 'Term-limited'], ['MN', 'Tim Walz', 'D', 'Not running'], ['NE', 'Jim Pillen', 'R', 'Running'],
		['NV', 'Joe Lombardo', 'R', 'Running'], ['NH', 'Kelly Ayotte', 'R', 'Running'], ['NM', 'Michelle Lujan Grisham', 'D', 'Term-limited'], ['NY', 'Kathy Hochul', 'D', 'Running'],
		['OH', 'Mike DeWine', 'R', 'Term-limited'], ['OK', 'Kevin Stitt', 'R', 'Term-limited'], ['OR', 'Tina Kotek', 'D', 'Running'], ['PA', 'Josh Shapiro', 'D', 'Running'],
		['RI', 'Dan McKee', 'D', 'Lost the primary'], ['SC', 'Henry McMaster', 'R', 'Term-limited'], ['SD', 'Larry Rhoden', 'R', 'Running'], ['TN', 'Bill Lee', 'R', 'Term-limited'],
		['TX', 'Greg Abbott', 'R', 'Running'], ['VT', 'Phil Scott', 'R', 'Running'], ['WI', 'Tony Evers', 'D', 'Not running'], ['WY', 'Mark Gordon', 'R', 'Term-limited']
	];
	// states that use a new congressional map in 2026 (one line each; sources: Wikipedia 2025-26 redistricting, Ballotpedia)
	E.REDISTRICT = [
		['TX', 'New map passed in August 2025.'], ['CA', 'New map approved by voters (Proposition 50, November 2025).'], ['NC', 'New map passed in October 2025.'],
		['OH', 'New map adopted by the Redistricting Commission (October 2025).'], ['UT', 'Court-chosen map.'], ['FL', 'New map passed in May 2026.'],
		['TN', 'New map passed in May 2026.'], ['LA', 'New map (May 2026); the House general election is on December 12.'], ['AL', 'New map after a June 2026 court ruling.']
	];
	// Election-day result pages run by each state (Secretary of State or election board). Some block automated checks; all were found 2026-10-27.
	E.RESULTS_URLS = { AL: 'https://www.sos.alabama.gov/alabama-votes/voter/election-data', AK: 'https://www.elections.alaska.gov/election-results/', AZ: 'https://results.arizona.vote/', AR: 'https://www.sos.arkansas.gov/elections/research/election-results', CA: 'https://electionresults.sos.ca.gov/', CO: 'https://www.sos.state.co.us/pubs/elections/Results/', CT: 'https://electionhistory.ct.gov/', DE: 'https://elections.delaware.gov/results/index.shtml', DC: 'https://electionresults.dcboe.org/', FL: 'https://results.elections.myflorida.com/', GA: 'https://results.sos.ga.gov/', HI: 'https://elections.hawaii.gov/election-results/', ID: 'https://voteidaho.gov/election-results/', IL: 'https://www.elections.il.gov/electionoperations/ElectionResults.aspx', IN: 'https://enr.indianavoters.in.gov/', IA: 'https://electionresults.iowa.gov/', KS: 'https://sos.ks.gov/elections/election-results.html', KY: 'https://elect.ky.gov/results/', LA: 'https://voterportal.sos.la.gov/graphical', ME: 'https://www.maine.gov/sos/elections-voting/election-results-data', MD: 'https://elections.maryland.gov/elections/results_data/', MA: 'https://electionstats.state.ma.us/', MI: 'https://mvic.sos.state.mi.us/votehistory/', MN: 'https://electionresults.sos.mn.gov/', MS: 'https://www.sos.ms.gov/elections-voting/election-results', MO: 'https://enr.sos.mo.gov/', MT: 'https://electionresults.mt.gov/', NE: 'https://electionresults.nebraska.gov/', NV: 'https://silverstateelection.nv.gov/', NH: 'https://www.sos.nh.gov/elections/elections/election-results', NJ: 'https://www.nj.gov/state/elections/election-information-results.shtml', NM: 'https://www.sos.nm.gov/voting-and-elections/election-results/', NY: 'https://nyenr.elections.ny.gov/', NC: 'https://er.ncsbe.gov/', ND: 'https://results.sos.nd.gov/', OH: 'https://www.ohiosos.gov/elections/election-results-and-data/', OK: 'https://results.okelections.gov/', OR: 'https://sos.oregon.gov/elections/pages/historical-data.aspx', PA: 'https://www.electionreturns.pa.gov/', RI: 'https://elections.ri.gov/', SC: 'https://scvotes.gov/elections-statistics/election-results/', SD: 'https://electionresults.sd.gov/', TN: 'https://elections.tn.gov/', TX: 'https://results.texas-election.com/races', UT: 'https://electionresults.utah.gov/', VT: 'https://electionarchive.vermont.gov/', VA: 'https://enr.elections.virginia.gov/', WA: 'https://results.vote.wa.gov/', WV: 'https://results.enr.clarityelections.com/WV/', WI: 'https://elections.wi.gov/elections/election-results', WY: 'https://sos.wyo.gov/Elections/ElectionResults.aspx' };

	// candidates whose market label carries no party (checked 2026-10-27: Alaska Division of Elections coverage, Ballotpedia, Wikipedia)
	E.CAND_PARTY = { 'jonathan kreiss-tomkins': 'D', 'bernadette wilson': 'R', 'dave bronson': 'R', 'david bronson': 'R', 'treg taylor': 'R', 'bill hill': 'I', 'mary peltola': 'D', 'dan sullivan': 'R', 'sen. dan sullivan': 'R', 'xavier becerra': 'D', 'steve hilton': 'R', 'independent': 'I', 'dan osborn': 'I', 'ken calvert': 'R', 'young kim': 'R', 'sydney kamlager-dove': 'D', 'samantha mota': 'D' };

	// ---------- Polymarket races ----------
	var RE_HOUSE = /^([A-Z]{2})-(\d\d|AL) House Election Winner(?: \(Individual\))?$/, RE_SEN = /^([A-Za-z .]+?) Senate Election Winner$/, RE_GOV = /^([A-Za-z .]+?) Governor Election Winner$/;
	E.raceKind = function (title) {
		var t = String(title || '').replace(/\s+/g, ' ').trim(), m;
		if ((m = RE_HOUSE.exec(t))) return E.APPORTION[m[1]] ? { kind: 'H', st: m[1], dist: m[2] === 'AL' ? 'AL' : m[2], key: 'H-' + m[1] + '-' + m[2] } : null;
		if ((m = RE_SEN.exec(t)) && E.ABBR[m[1].toLowerCase()]) { var s = E.ABBR[m[1].toLowerCase()]; return { kind: 'S', st: s, key: 'S-' + s }; }
		if ((m = RE_GOV.exec(t)) && !/lieutenant/i.test(t) && E.ABBR[m[1].toLowerCase()]) { var g = E.ABBR[m[1].toLowerCase()]; return { kind: 'G', st: g, key: 'G-' + g }; }
		return null;
	};
	E.partyOf = function (question, label) {
		var q = String(question || ''), l = String(label || '').trim(), m = /\((D|R|I|L|G)\)\s*$/.exec(l);
		if (/\bDemocrat/i.test(q)) return 'D';
		if (/\bRepublican/i.test(q)) return 'R';
		if (m) return m[1] === 'D' || m[1] === 'R' ? m[1] : 'I';
		if (/\ban? independent\b/i.test(q) || /^independent$/i.test(l)) return 'I';
		return E.CAND_PARTY[l.replace(/\s*\([A-Z]\)$/, '').toLowerCase()] || 'O';
	};
	function cleanName(label, party) {
		var l = String(label || '').replace(/\s*\([A-Z]\)\s*$/, '').replace(/^Sen\.\s+/, '').trim();
		if (/^(Democratic|Democrats?|Republican|Republicans?)( Party)?$/i.test(l)) return party === 'D' ? 'Democratic Party' : 'Republican Party';
		return l;
	}
	// one Polymarket "... Election Winner" event -> race {key, kind, st, dist, url, vol, c:[{n, pt, p}], pD, pR, pO, res}
	// p = the market's price of Yes in percent; pD / pR / pO = the shares of the parties after normalising (they sum to 100).
	// res = the party of the winner once Polymarket has resolved the race (the market's call, not an official result).
	E.raceFromEvent = function (e) {
		var k = E.raceKind(e && e.title); if (!k) return null;
		var ms = (e.markets || []).filter(function (m) { return m && m.outcomePrices && (m.active !== false); }), c = [], res = null, hasParty = false;
		ms.forEach(function (m) {
			var p = num(jsonArr(m.outcomePrices)[0]); if (p === null) return;
			var pt = E.partyOf(m.question, m.groupItemTitle);
			if (/\bDemocrat|\bRepublican/i.test(m.question || '')) hasParty = true;
			if (m.closed && p >= 0.99) res = pt;
			if (m.closed && p <= 0.01) return;
			if (p < 0.004 && !/\bDemocrat|\bRepublican/i.test(m.question || '')) return;
			c.push({ n: cleanName(m.groupItemTitle || m.question, pt), pt: pt, p: round(p * 100, 1) });
		});
		if (!c.length && !res) return null;
		// when a race has both party markets and a named candidate (Alaska's at-large seat), the named one is an extra, non-party candidate
		if (hasParty) c.forEach(function (x) { if (x.pt === 'O') x.pt = 'I'; });
		c.sort(function (a, b) { return b.p - a.p; });
		var sum = { D: 0, R: 0, I: 0, O: 0 }; c.forEach(function (x) { sum[x.pt] = (sum[x.pt] || 0) + x.p; });
		var tot = sum.D + sum.R + sum.I + sum.O;
		var r = { key: k.key, kind: k.kind, st: k.st, url: 'https://polymarket.com/event/' + encodeURIComponent(e.slug), vol: round(num(e.volume), 0), c: c.slice(0, 4) };
		if (k.dist) r.dist = k.dist;
		r.pD = tot ? round(sum.D / tot * 100, 1) : 0; r.pR = tot ? round(sum.R / tot * 100, 1) : 0; r.pO = tot ? round((sum.I + sum.O) / tot * 100, 1) : 0;
		// the third column's party: the biggest non-D/R candidate's (I if independent, O if unknown)
		var third = c.filter(function (x) { return x.pt === 'I' || x.pt === 'O'; })[0]; r.oP = third ? third.pt : 'I';
		if (res) r.res = res;
		return r;
	};
	E.parseRaces = function (events) {
		var out = { H: [], S: [], G: [] }, seen = {};
		(events || []).forEach(function (e) {
			var r = E.raceFromEvent(e); if (!r) return;
			// the same race can appear twice (an open and a resolved event): keep the resolved one, else the busier one
			if (seen[r.key]) { var o = seen[r.key]; if ((r.res && !o.res) || (!o.res && (r.vol || 0) > (o.vol || 0))) { out[r.kind][out[r.kind].indexOf(o)] = r; seen[r.key] = r; } return; }
			seen[r.key] = r; out[r.kind].push(r);
		});
		['H', 'S', 'G'].forEach(function (k) { out[k].sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; }); });
		return out;
	};
	// overview markets (chamber control, balance of power, seat counts): outcome list as the market shows it
	E.OVERVIEW_SLUGS = { 'which-party-will-win-the-house-in-2026': 'house', 'which-party-will-win-the-senate-in-2026': 'senate', 'balance-of-power-2026-midterms': 'balance', 'republican-senate-seats-after-the-2026-midterm-elections-927': 'rsenseats', 'how-many-republican-governors-after-the-2026-midterm-elections': 'rgovs' };
	E.parseOverview = function (events) {
		var out = {};
		(events || []).forEach(function (e) {
			var id = E.OVERVIEW_SLUGS[e && e.slug]; if (!id) return;
			var oc = [];
			(e.markets || []).forEach(function (m) {
				if (!m || !m.outcomePrices || m.active === false) return;
				var p = num(jsonArr(m.outcomePrices)[0]); if (p === null) return;
				if (p < 0.002 && /^other$/i.test(m.groupItemTitle || '')) return;
				oc.push({ l: String(m.groupItemTitle || m.question || '').slice(0, 60), p: round(p * 100, 1), t: num(m.groupItemThreshold) });
			});
			if (id === 'rsenseats' || id === 'rgovs') oc.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
			else oc.sort(function (a, b) { return b.p - a.p; });
			if (oc.length) out[id] = { title: String(e.title || ''), url: 'https://polymarket.com/event/' + encodeURIComponent(e.slug), vol: round(num(e.volume), 0), oc: oc };
		});
		return out;
	};
	// Kalshi CONTROLH / CONTROLS -> {D, R} (middle of the best bid and ask, else the last trade) in percent
	E.parseKalshiControl = function (j) {
		var ev = (j && j.events || []).filter(function (e) { return /-2026$/.test(e.event_ticker || ''); })[0]; if (!ev) throw new Error('no 2026 event');
		var out = { title: ev.title, url: 'https://kalshi.com/markets/' + String(ev.series_ticker || ev.event_ticker.split('-')[0]).toLowerCase(), contracts: 0 };
		(ev.markets || []).forEach(function (m) {
			var b = num(m.yes_bid_dollars), a = num(m.yes_ask_dollars), l = num(m.last_price_dollars), p = (b !== null && a !== null && a > 0) ? (b + a) / 2 : l;
			var lab = String(m.yes_sub_title || m.title || ''), k = /democrat/i.test(lab) ? 'D' : /republican/i.test(lab) ? 'R' : null;
			if (m.result && /yes/i.test(m.result)) out.res = k;
			if (k && p !== null) out[k] = round(p * 100, 1);
			out.contracts += num(m.volume_fp != null ? m.volume_fp : m.volume) || 0;
		});
		if (out.D == null && out.R == null) throw new Error('no prices');
		out.contracts = Math.round(out.contracts);
		return out;
	};

	// ---------- build your own outcome ----------
	// shift (points at a 50-50 race, + = toward D) applied on the log-odds scale, so a 95% race barely moves and a 50% race moves the full amount
	function logit(p) { p = Math.min(0.9999, Math.max(0.0001, p)); return Math.log(p / (1 - p)); }
	function sig(x) { return 1 / (1 + Math.exp(-x)); }
	E.shifted = function (pD, pR, shift) {
		var two = (pD || 0) + (pR || 0); if (!two) return { D: pD || 0, R: pR || 0 };
		if (!shift) return { D: pD, R: pR };
		var k = logit(0.5 + Math.max(-49.9, Math.min(49.9, shift)) / 100), d = sig(logit(pD / two) + k);
		return { D: round(d * two, 1), R: round((1 - d) * two, 1) };
	};
	// the side the market prices highest after the shift ('D', 'R', the third column's party, or 'U' when tied)
	E.favourite = function (r, shift) {
		if (r.res) return r.res;
		var s = E.shifted(r.pD, r.pR, shift), o = r.pO || 0;
		if (o > s.D && o > s.R) return r.oP || 'I';
		return s.D > s.R ? 'D' : s.R > s.D ? 'R' : 'U';
	};
	// picks: {raceKey: 'D'|'R'|'I'|'U'} overrides; base: 'market' | 'blank'. Returns per-race outcome and totals.
	E.outcome = function (races, opt) {
		opt = opt || {}; var picks = opt.picks || {}, by = {}, n = { D: 0, R: 0, I: 0, U: 0 };
		(races || []).forEach(function (r) {
			var o = picks[r.key] || (opt.base === 'blank' && !r.res ? 'U' : E.favourite(r, opt.shift || 0));
			if (o === 'O') o = 'I';
			by[r.key] = o; n[o] = (n[o] || 0) + 1;
		});
		return { by: by, n: n };
	};
	// chamber totals: kind 'H' | 'S' | 'G'; n = outcome().n for the races on the ballot; ind = how new independents count: '' (on their own), 'D', 'R'
	E.chamber = function (kind, n, ind, missing) {
		var t = { D: n.D || 0, R: n.R || 0, I: n.I || 0, U: (n.U || 0) + (missing || 0) }, majority, total, ctl = null, note = '';
		if (kind === 'S') {
			total = 100; majority = 51;
			t.D += E.SENATE.hold.D; t.R += E.SENATE.hold.R;
			var hi = E.SENATE.hold.I;   // Sanders and King caucus with the Democrats
			var dc = t.D + hi + (ind === 'D' ? t.I : 0), rc = t.R + (ind === 'R' ? t.I : 0);
			t.Ihold = hi; t.Dcaucus = dc; t.Rcaucus = rc;
			// 51 is a majority; with 50 the Vice President's party (R) controls, because the rest cannot reach 51
			if (dc >= 51) ctl = 'D'; else if (rc >= 50) { ctl = 'R'; if (rc === 50) note = 'At 50-50 the Vice President (R) breaks ties'; }
		} else if (kind === 'H') {
			total = 435; majority = 218;
			var hd = t.D + (ind === 'D' ? t.I : 0), hr = t.R + (ind === 'R' ? t.I : 0);
			t.Dcaucus = hd; t.Rcaucus = hr;
			if (hd >= 218) ctl = 'D'; else if (hr >= 218) ctl = 'R';
		} else {
			total = 50; majority = 26;
			t.D += E.GOV.hold.D; t.R += E.GOV.hold.R; t.Dcaucus = t.D; t.Rcaucus = t.R;
			if (t.D >= 26) ctl = 'D'; else if (t.R >= 26) ctl = 'R';
		}
		t.total = total; t.majority = majority; t.ctl = ctl; t.note = note;
		t.need = { D: Math.max(0, majority - t.Dcaucus), R: Math.max(0, (kind === 'S' ? 50 : majority) - t.Rcaucus) };
		return t;
	};
	// sum of each race's normalised market share = the number of seats each side would get "on average" if the prices were right. Plain arithmetic, not a forecast.
	E.sumShares = function (races) {
		var s = { D: 0, R: 0, O: 0 }; (races || []).forEach(function (r) { if (r.res) { s[r.res === 'D' || r.res === 'R' ? r.res : 'O'] += 1; return; } s.D += (r.pD || 0) / 100; s.R += (r.pR || 0) / 100; s.O += (r.pO || 0) / 100; });
		return { D: round(s.D, 1), R: round(s.R, 1), O: round(s.O, 1) };
	};
	E.closeness = function (r) { return r.res ? 999 : Math.abs((r.pD || 0) - (r.pR || 0)); };
	// compact share string of user overrides: "H-AZ-01:R,S-GA:D"
	E.encodePicks = function (p) { return Object.keys(p || {}).sort().map(function (k) { return k + ':' + p[k]; }).join(','); };
	E.decodePicks = function (s) { var o = {}; String(s || '').split(',').forEach(function (x) { var m = /^([HSG]-[A-Z]{2}(?:-(?:\d\d|AL))?):([DRIU])$/.exec(x.trim()); if (m) o[m[1]] = m[2]; }); return o; };
	E.raceLabel = function (r) { return r.kind === 'H' ? r.st + '-' + r.dist : E.STATES[r.st]; };

	// hemicycle seat positions (parliament arc): n seats -> [{x, y, r}] in a 0..1 x 0..0.5 box, left to right by angle then row
	E.hemicycle = function (n) {
		var rows = Math.max(1, Math.round(Math.sqrt(n / 2.4))), r0 = 0.32, r1 = 0.5, radii = [], i, j, tot = 0;
		for (i = 0; i < rows; i++) { radii.push(rows === 1 ? (r0 + r1) / 2 : r0 + (r1 - r0) * i / (rows - 1)); tot += radii[i]; }
		var counts = radii.map(function (r) { return Math.round(n * r / tot); }), diff = n - counts.reduce(function (a, b) { return a + b; }, 0);
		counts[counts.length - 1] += diff;
		var pts = [], dr = rows === 1 ? 0.05 : (r1 - r0) / (rows - 1);
		for (i = 0; i < rows; i++) for (j = 0; j < counts[i]; j++) { var a = Math.PI * (1 - (counts[i] === 1 ? 0.5 : j / (counts[i] - 1))); pts.push({ a: a, x: 0.5 + radii[i] * Math.cos(a), y: 0.5 - radii[i] * Math.sin(a), row: i }); }
		pts.sort(function (p, q) { return q.a - p.a || p.row - q.row; });
		var rad = Math.min(dr * 0.42, Math.PI * r0 / Math.max(1, counts[0]) * 0.45);
		// shrink about the centre so the outer dots stay inside the 0..1 x 0..0.5 box
		var k = (0.5 - rad) / 0.5; pts.forEach(function (p) { p.r = rad; p.x = 0.5 + (p.x - 0.5) * k; p.y = 0.5 - (0.5 - p.y) * k; });
		return pts;
	};

	// ---------- Canada and British Columbia (hand-entered results, checked 2026-10-27) ----------
	// party colours: each party's usual colour. Votes and percentages as published.
	E.CA2025 = {
		id: 'ca2025', title: 'Canada, federal election, 28 April 2025', seats: 343, majority: 172, turnout: 69.5, votes: 19641663,
		status: 'Validated results (Elections Canada), after judicial recounts.',
		parties: [
			{ k: 'LPC', n: 'Liberal', s: 169, v: 8595488, pc: 43.76, col: '#d71920' },
			{ k: 'CPC', n: 'Conservative', s: 144, v: 8113484, pc: 41.31, col: '#1a4782' },
			{ k: 'BQ', n: 'Bloc Québécois', s: 22, v: 1236349, pc: 6.29, col: '#33b2cc', only: 'Runs candidates in Quebec only (78 of 343 seats)' },
			{ k: 'NDP', n: 'New Democratic', s: 7, v: 1234673, pc: 6.29, col: '#f37021' },
			{ k: 'GPC', n: 'Green', s: 1, v: 238892, pc: 1.22, col: '#3d9b35' },
			{ k: 'PPC', n: "People's Party", s: 0, v: 136977, pc: 0.70, col: '#4b2e83' },
			{ k: 'OTH', n: 'Others and independents', s: 0, v: 85800, pc: 0.43, col: '#8a8f98' }
		],
		notes: [
			'Recounts changed three seats from the election-night count: Terrebonne (to the Liberal candidate by 1 vote), Terra Nova–The Peninsulas (to the Conservative candidate) and Milton East–Halton Hills South (Conservative by 21 votes).',
			'On 13 February 2026 the Supreme Court of Canada annulled the Terrebonne result; the Liberal candidate won the by-election of 13 April 2026.',
			'Party standings in the House have changed since election day (members changing party, resignations, by-elections). The live count from the House of Commons is shown under "House today".'
		],
		sources: [['Elections Canada, 45th general election', 'https://www.elections.ca/content.aspx?section=ele&dir=pas/45ge&document=index&lang=e'], ['2025 Canadian federal election (Wikipedia: results table and recounts)', 'https://en.wikipedia.org/wiki/2025_Canadian_federal_election'], ['House of Commons: party standings today', 'https://www.ourcommons.ca/members/en/party-standings']]
	};
	E.BC2024 = {
		id: 'bc2024', title: 'British Columbia, provincial election, 19 October 2024', seats: 93, majority: 47, turnout: 58.45, votes: 2105332,
		status: 'Final results (Elections BC), after recounts.',
		parties: [
			{ k: 'NDP', n: 'BC NDP', s: 47, v: 944463, pc: 44.86, col: '#f37021' },
			{ k: 'CON', n: 'Conservative Party of BC', s: 44, v: 911142, pc: 43.28, col: '#115da8' },
			{ k: 'GRN', n: 'BC Green Party', s: 2, v: 174393, pc: 8.24, col: '#3d9b35' },
			{ k: 'IND', n: 'Independents', s: 0, v: 72583, pc: 3.45, col: '#8a8f98' },
			{ k: 'OTH', n: 'Others', s: 0, v: 2751, pc: 0.13, col: '#b5b9c0' }
		],
		notes: ['BC United (formerly the BC Liberals) suspended its campaign before the vote; some of its candidates ran as independents.'],
		sources: [['Elections BC: provincial election results', 'https://elections.bc.ca/resources/results/provincial-election-results/'], ['2024 British Columbia general election (Wikipedia)', 'https://en.wikipedia.org/wiki/2024_British_Columbia_general_election']]
	};
	// snap election called 22 September 2026. Initial count (Elections BC, 26 Oct 2026 10:34 PST); the final count (mail-in and absentee ballots) runs 6-10 November.
	E.BC2026 = {
		id: 'bc2026', title: 'British Columbia, provincial election, 24 October 2026', seats: 93, majority: 47, turnout: 48.14, votes: 1799550, prelim: true,
		status: 'Initial count (preliminary). Mail-in and absentee ballots are counted at the final count, 6 to 10 November 2026.',
		parties: [
			{ k: 'CON', n: 'Conservative Party of BC', s: 63, v: 862688, pc: 48.06, col: '#115da8' },
			{ k: 'NDP', n: 'BC NDP', s: 28, v: 670811, pc: 37.37, col: '#f37021' },
			{ k: 'GRN', n: 'BC Green Party', s: 2, v: 196896, pc: 10.97, col: '#3d9b35' },
			{ k: 'CBC', n: 'CentreBC', s: 0, v: 29104, pc: 1.62, col: '#7c5cbf' },
			{ k: 'ONE', n: 'OneBC', s: 0, v: 27056, pc: 1.51, col: '#6b7280' },
			{ k: 'OTH', n: 'Others and independents', s: 0, v: 8578, pc: 0.48, col: '#b5b9c0' }
		],
		notes: ['The election was called on 22 September 2026, about two years after the 2024 vote.', 'The next fixed date for a BC election is 19 October 2030, the same day as the next BC local elections.'],
		sources: [['Elections BC: event night results (live)', 'https://results.elections.bc.ca/'], ['44th British Columbia general election (Wikipedia)', 'https://en.wikipedia.org/wiki/44th_British_Columbia_general_election']]
	};
	// map Elections BC party names to our keys
	E.BC_KEYS = { 'Conservative Party': 'CON', 'BC NDP': 'NDP', 'BC Green Party': 'GRN', 'CentreBC': 'CBC', 'OneBC': 'ONE' };
	// results.elections.bc.ca (event night reporting) -> {asOf, stage, turnout, votes, parties:[{n, k, s, v, pc}]}
	E.parseBcEnr = function (html) {
		var t = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
		var i = t.indexOf('Electoral Districts Leading'); if (i < 0) i = t.indexOf('Electoral Districts Elected'); if (i < 0) throw new Error('no party table');
		var seg = t.slice(i, i + 3000), re = /([A-Z][A-Za-z.'& ]{1,60}?) (\d{1,3}) ([\d,]{1,9}) ([\d.]{1,6}) ?%/g, m, parties = [];
		seg = seg.replace(/^Electoral Districts (Leading|Elected)( Total Votes)?( % of Vote)?/, '');
		while ((m = re.exec(seg))) { var n = m[1].trim(); parties.push({ n: n, k: E.BC_KEYS[n] || null, s: +m[2], v: +m[3].replace(/,/g, ''), pc: +m[4] }); if (/View More/.test(seg.slice(m.index, m.index + m[0].length + 12))) break; }
		if (!parties.length) throw new Error('no parties');
		var asOf = /As of ([A-Z][a-z]+ \d{1,2}, \d{4} \d{1,2}:\d\d ?[A-Z]{2,4})/.exec(t), tu = /([\d.]+)% (?:Preliminary )?Voter Turnout/.exec(t), tv = /([\d,]+) Total Votes Considered/.exec(t);
		var fin = /FINAL COUNT (Complete|In Progress|[A-Z][a-z]+ \d{1,2}, \d{4})/.exec(t), ini = /INITIAL COUNT (Complete|In Progress)/.exec(t);
		return { asOf: asOf ? asOf[1] : null, turnout: tu ? +tu[1] : null, votes: tv ? +tv[1].replace(/,/g, '') : null, initial: ini ? ini[1] : null, final: fin ? fin[1] : null, parties: parties };
	};
	// House of Commons party standings CSV (Province / Territory, Political Affiliation, Seats) -> {Liberal: 173, ...}
	E.parseCommonsCsv = function (csv) {
		var lines = String(csv || '').replace(/^﻿/, '').split(/\r?\n/), out = {}, n = 0;
		if (!/Political Affiliation/i.test(lines[0] || '')) throw new Error('not the standings csv');
		lines.slice(1).forEach(function (l) { var c = l.split(','); if (c.length < 3) return; var s = num(c[c.length - 1]); if (s === null) return; var p = c[c.length - 2].trim(); out[p] = (out[p] || 0) + s; n += s; });
		if (!n) throw new Error('no seats');
		return { by: out, total: n };
	};
	E.COMMONS_KEYS = { Liberal: 'LPC', Conservative: 'CPC', 'Bloc Québécois': 'BQ', NDP: 'NDP', 'Green Party': 'GPC', Independent: 'IND', Vacant: 'VAC' };

	// seats if they followed the vote: highest-averages (D'Hondt, Sainte-Laguë) or largest remainder (Hare), parties under the threshold get none
	E.proportional = function (parties, seats, method, threshold) {
		var el = parties.filter(function (p) { return p.k !== 'OTH' && p.k !== 'IND' && p.pc >= (threshold || 0); }), out = {};
		parties.forEach(function (p) { out[p.k] = 0; });
		if (!el.length) return out;
		if (method === 'hare') {
			var tv = el.reduce(function (a, p) { return a + p.v; }, 0), q = tv / seats, rem = [], used = 0;
			el.forEach(function (p) { var x = p.v / q, f = Math.floor(x); out[p.k] = f; used += f; rem.push([x - f, p.k]); });
			rem.sort(function (a, b) { return b[0] - a[0]; });
			for (var i = 0; used < seats; i++, used++) out[rem[i % rem.length][1]]++;
			return out;
		}
		var div = method === 'sl' ? function (s) { return 2 * s + 1; } : function (s) { return s + 1; };
		for (var k = 0; k < seats; k++) {
			var best = null, bv = -1;
			el.forEach(function (p) { var v = p.v / div(out[p.k]); if (v > bv) { bv = v; best = p.k; } });
			out[best]++;
		}
		return out;
	};
	// every combination of parties (with seats) that reaches the majority and needs every member (minimal winning coalitions)
	E.coalitions = function (parties, majority) {
		var ps = parties.filter(function (p) { return p.s > 0; }), out = [], n = ps.length, m;
		for (m = 1; m < (1 << n); m++) {
			var set = [], s = 0, i;
			for (i = 0; i < n; i++) if (m & (1 << i)) { set.push(ps[i]); s += ps[i].s; }
			if (s < majority) continue;
			if (set.every(function (p) { return s - p.s < majority; })) out.push({ ks: set.map(function (p) { return p.k; }), s: s });
		}
		return out.sort(function (a, b) { return a.ks.length - b.ks.length || b.s - a.s; });
	};

	// ---------- calendar (hand-entered; checked 2026-10-27) ----------
	// [date (YYYY-MM-DD, or YYYY-MM / YYYY), approx text or '', group ('ca' | 'us' | 'world'), place, what, basis, source]
	E.CALENDAR = [
		['2026-10-27', '', 'world', 'Israel', 'Knesset (general)', 'Set by the Central Elections Committee', 'https://www.i24news.tv/en/news/israel-election-s-2026/artc-israeli-elections-set-for-next-october-27'],
		['2026-11-01', '', 'world', 'Bulgaria', 'President, second round', 'Scheduled', 'https://en.wikipedia.org/wiki/2026_national_electoral_calendar'],
		['2026-11-03', '', 'us', 'United States', 'Midterms: all 435 House seats, 35 Senate seats, 36 governors, state and local races', 'Fixed by law', 'https://en.wikipedia.org/wiki/2026_United_States_elections'],
		['2026-11-07', '', 'world', 'New Zealand', 'House of Representatives (general)', 'Announced by the Prime Minister (21 Jan 2026)', 'https://www.1news.co.nz/2026/01/21/game-on-as-pm-luxon-reveals-2026-election-date/'],
		['2026-11-28', '', 'world', 'Taiwan', 'Local elections (mayors, county heads, councils)', 'Set by the Central Election Commission', 'https://en.wikipedia.org/wiki/2026_Taiwanese_local_elections'],
		['2026-11-29', '', 'world', 'Spain', 'Congress and Senate (early election)', 'Called in October 2026', 'https://www.itv.com/news/2026-10-05/spains-prime-minister-announces-snap-election-for-november'],
		['2026-12-12', '', 'us', 'United States (Louisiana)', 'House general election under the new map (primary on 3 November)', 'Set by state law', 'https://en.wikipedia.org/wiki/2025%E2%80%932026_United_States_redistricting'],
		['2027-01-16', '', 'world', 'Nigeria', 'President and National Assembly', 'Electoral commission timetable (revised Feb 2026)', 'https://nairametrics.com/2026/02/27/inec-revises-2027-election-timetable-presidential-poll-now-holds-january-16/'],
		['2027-04-18', 'Expected', 'world', 'France', 'President, first round (second round 2 May if needed)', 'Inside the constitutional window of 8-23 April 2027; no decree yet', 'https://en.wikipedia.org/wiki/2027_French_presidential_election'],
		['2027-06-06', '', 'world', 'Mexico', 'Chamber of Deputies (midterm) and state elections', 'Fixed by law', 'https://en.wikipedia.org/wiki/2027_Mexican_legislative_election'],
		['2027-08-10', '', 'world', 'Kenya', 'General: President, Parliament, counties', 'Electoral commission plan', 'https://en.wikipedia.org/wiki/2027_Kenyan_general_election'],
		['2027-10-04', '', 'ca', 'Prince Edward Island', 'Provincial general election', 'Fixed date (first Monday of October)', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2027-10-05', '', 'ca', 'Manitoba', 'Provincial general election', 'Fixed date (first Tuesday of October)', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2027-10-05', '', 'ca', 'Northwest Territories', 'Territorial general election (no parties)', 'Fixed date', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2027-10-18', '', 'ca', 'Alberta', 'Provincial general election', 'Fixed date (third Monday of October)', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2027-10-24', '', 'world', 'Argentina', 'President and Congress', 'Scheduled', 'https://en.wikipedia.org/wiki/2027_Argentine_general_election'],
		['2027-11-11', 'On or before', 'world', 'Poland', 'Sejm and Senate', 'Latest legal date; the President sets the day', 'https://en.wikipedia.org/wiki/2027_Polish_parliamentary_election'],
		['2027-12-22', 'On or before', 'world', 'Italy', 'Chamber of Deputies and Senate', 'Latest legal date', 'https://en.wikipedia.org/wiki/Next_Italian_general_election'],
		['2028-01', 'Month expected', 'world', 'Taiwan', 'President and Legislative Yuan', 'Expected; exact day not set', 'https://en.wikipedia.org/wiki/2028_Taiwanese_presidential_election'],
		['2028-04-12', 'On or before', 'world', 'South Korea', 'National Assembly', 'Latest legal date', 'https://en.wikipedia.org/wiki/2028_South_Korean_legislative_election'],
		['2028-05-08', '', 'world', 'Philippines', 'President, Vice President, Congress, local', 'Fixed by law (second Monday of May)', 'https://en.wikipedia.org/wiki/2028_Philippine_presidential_election'],
		['2028-05-14', 'On or before', 'world', 'Turkey', 'President and Grand National Assembly', 'Latest legal date', 'https://en.wikipedia.org/wiki/2028_Turkish_presidential_election'],
		['2028-05-20', 'On or before', 'world', 'Australia', 'House of Representatives and half the Senate', 'Latest date for a joint election', 'https://en.wikipedia.org/wiki/Next_Australian_federal_election'],
		['2028-07', 'Month expected', 'world', 'Japan', 'House of Councillors (half)', 'Terms end 25 July 2028', 'https://en.wikipedia.org/wiki/House_of_Councillors'],
		['2028-10-16', '', 'ca', 'New Brunswick', 'Provincial general election', 'Fixed date (third Monday of October)', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2028-10-30', '', 'ca', 'Saskatchewan', 'Provincial general election', 'Fixed date (last Monday of October)', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2028-11-07', '', 'us', 'United States', 'President, House, a third of the Senate', 'Fixed by law', 'https://en.wikipedia.org/wiki/2028_United_States_presidential_election'],
		['2029', 'Year expected', 'world', 'Indonesia', 'President and legislature', 'Expected; the day is not set', 'https://en.wikipedia.org/wiki/2029_Indonesian_general_election'],
		['2029-03-25', 'On or before', 'world', 'Germany', 'Bundestag', 'Latest legal date (window 28 Jan to 25 Mar 2029)', 'https://en.wikipedia.org/wiki/Next_German_federal_election'],
		['2029-05', 'By May-June', 'world', 'India', 'Lok Sabha (general, in phases)', 'The current Lok Sabha term ends in June 2029', 'https://en.wikipedia.org/wiki/2029_Indian_general_election'],
		['2029-08-15', 'On or before', 'world', 'United Kingdom', 'House of Commons (general)', 'Latest legal date', 'https://en.wikipedia.org/wiki/Next_United_Kingdom_general_election'],
		['2029-08-26', 'On or before', 'world', 'South Africa', 'National Assembly and provinces', 'Latest legal date', 'https://en.wikipedia.org/wiki/2029_South_African_general_election'],
		['2029-09', 'Month expected', 'world', 'Norway', 'Storting', 'Expected (10 or 17 September)', 'https://en.wikipedia.org/wiki/2029_Norwegian_parliamentary_election'],
		['2029-10-09', '', 'ca', 'Newfoundland and Labrador', 'Provincial general election', 'Fixed date (second Tuesday of October)', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2029-10-14', 'On or before', 'world', 'Portugal', 'Assembly of the Republic', 'Latest legal date', 'https://en.wikipedia.org/wiki/Next_Portuguese_legislative_election'],
		['2029-10-15', '', 'ca', 'Canada', 'House of Commons (federal general election)', 'Fixed date (third Monday of October); an earlier vote is possible', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2029-10-29', '', 'ca', 'Nunavut', 'Territorial general election (no parties)', 'Fixed date', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2029-11-05', '', 'ca', 'Yukon', 'Territorial general election', 'Fixed date', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2029-11-18', '', 'world', 'Chile', 'President (first round), Congress', 'Scheduled (runoff 16 Dec 2029)', 'https://www.biobiochile.cl/noticias/servicios/toma-nota/2025/12/15/con-un-descanso-de-tres-anos-revisa-cuando-son-y-que-se-votara-en-las-proximas-elecciones.shtml'],
		['2029-12-07', 'Legislature ends', 'ca', 'Nova Scotia', 'Provincial general election (no fixed date since 2025)', 'The vote must follow within weeks of this date at the latest', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2030-03-07', 'Legislature ends', 'ca', 'Ontario', 'Provincial general election (no fixed date since 2025)', 'The vote must follow within weeks of this date at the latest', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2030-10-07', '', 'ca', 'Quebec', 'Provincial general election', 'Fixed date (first Monday of October)', 'https://en.wikipedia.org/wiki/Fixed_election_dates_in_Canada'],
		['2030-10-19', '', 'ca', 'British Columbia', 'Provincial general election', 'Fixed date (third Saturday of October, four years after the 2026 vote)', 'https://www.ctvnews.ca/vancouver/article/bcs-next-provincial-and-local-elections-scheduled-for-the-same-day-in-2030/'],
		['2030-10-19', '', 'ca', 'British Columbia', 'Local elections (mayors, councils, school trustees)', 'Fixed date (every four years)', 'https://www.ctvnews.ca/vancouver/article/bcs-next-provincial-and-local-elections-scheduled-for-the-same-day-in-2030/']
	];
	// recent (2026): [date, group, place, what, outcome (one neutral sentence), source]
	E.RECENT = [
		['2026-10-24', 'ca', 'British Columbia', 'Provincial general election (early)', 'Conservative Party of BC: 63 of 93 seats at the initial count; BC NDP 28, BC Green 2. Final count 6-10 November.', 'https://results.elections.bc.ca/'],
		['2026-10-17', 'ca', 'British Columbia', 'Local elections', 'Mayors, councils and school trustees were elected across the province.', 'https://dailyhive.com/vancouver/metro-vancouver-civic-election-mayoral-winners-results-2026'],
		['2026-10-25', 'world', 'Brazil', 'President, second round', 'Luiz Inácio Lula da Silva was re-elected (51.8% to 48.2% for Flávio Bolsonaro).', 'https://en.wikipedia.org/wiki/2026_Brazilian_general_election'],
		['2026-10-05', 'ca', 'Quebec', 'Provincial general election', 'The Parti Québécois won the most seats and formed a minority government.', 'https://en.wikipedia.org/wiki/2026_Quebec_general_election'],
		['2026-09-13', 'world', 'Sweden', 'Riksdag', 'The Social Democrat-led parties won 176 of 349 seats; the governing parties 173.', 'https://en.wikipedia.org/wiki/2026_Swedish_general_election'],
		['2026-06-21', 'world', 'Colombia', 'President, second round', 'Abelardo de la Espriella won (49.7% to 48.7% for Iván Cepeda).', 'https://en.wikipedia.org/wiki/2026_Colombian_presidential_election'],
		['2026-06-07', 'world', 'Peru', 'President, second round', 'Keiko Fujimori won (50.1% to 49.9% for Roberto Sánchez).', 'https://en.wikipedia.org/wiki/2026_Peruvian_general_election'],
		['2026-05-07', 'world', 'United Kingdom (Scotland)', 'Scottish Parliament', 'SNP 58 of 129 seats; John Swinney remained First Minister.', 'https://en.wikipedia.org/wiki/2026_Scottish_Parliament_election'],
		['2026-05-07', 'world', 'United Kingdom (Wales)', 'Senedd', 'Plaid Cymru 43 of 96 seats; Rhun ap Iorwerth became First Minister.', 'https://en.wikipedia.org/wiki/2026_Senedd_election'],
		['2026-04-12', 'world', 'Hungary', 'National Assembly', 'Tisza 141 of 199 seats; Péter Magyar became Prime Minister.', 'https://en.wikipedia.org/wiki/2026_Hungarian_parliamentary_election'],
		['2026-02-08', 'world', 'Japan', 'House of Representatives', 'LDP 316 of 465 seats; Sanae Takaichi remained Prime Minister.', 'https://en.wikipedia.org/wiki/2026_Japanese_general_election']
	];
	// date of a calendar row as ms (start of the day, UTC; a month or year alone = its first day)
	E.calTime = function (d) { var s = String(d); if (/^\d{4}$/.test(s)) s += '-01-01'; else if (/^\d{4}-\d\d$/.test(s)) s += '-01'; return Date.parse(s + 'T00:00:00Z'); };
	E.upcoming = function (now, group) {
		now = now == null ? Date.now() : now;
		return E.CALENDAR.filter(function (r) { return (!group || group === 'all' || r[2] === group) && E.calTime(r[0]) + 864e5 > now; });
	};

	// ---------- glossary ----------
	E.GLOSSARY = {
		midterm: ['Midterm elections', 'US elections held halfway through a President’s four-year term. Every House seat, about a third of the Senate, and most governors are on the ballot.'],
		house: ['US House of Representatives', '435 members, each elected for two years in a district of roughly equal population. A party needs 218 seats for a majority.'],
		senate: ['US Senate', '100 senators, two per state, each elected for six years; about a third are elected every two years. 51 seats is a majority; at 50-50 the Vice President casts the deciding vote.'],
		governor: ['Governor', 'The elected head of a state’s government. 36 states elect a governor in 2026.'],
		special: ['Special election', 'An election to fill a seat for the rest of a term, after a member died, resigned or was appointed to another office. In 2026 the Senate seats in Ohio and Florida are specials.'],
		open: ['Open seat', 'A seat whose current holder is not on the ballot (retiring, running for another office, or lost the primary).'],
		caucus: ['Caucus', 'The group of members who work together in a chamber. Independents choose which party’s caucus to join; it counts for which side has the majority.'],
		redistricting: ['Redistricting', 'Redrawing the boundaries of House districts. Normally done after each ten-year census; several states drew new maps again in 2025-26.'],
		pm: ['Prediction market', 'A market where people buy and sell contracts that pay $1 if an event happens. The price (say 63¢) is read as the traders’ chance (63%). It is not a poll and not a forecast by MES; prices can be moved by a few large traders and the markets are not open to everyone in every country.'],
		polymarket: ['Polymarket', 'A prediction market. We show the last trade price of each "Yes" contract. Its election markets settle on the party (or candidate) that wins, according to credible reporting.'],
		kalshi: ['Kalshi', 'A US-regulated prediction exchange. We show the middle of the best bid and ask for each answer. Volume is counted in contracts (each pays $1), not dollars.'],
		shares: ['Normalised share', 'The prices of all the answers in a race rarely add to exactly 100%. To compare races we divide each party’s price by the total, so D + R + others = 100%.'],
		sum: ['Adding up the race prices', 'If every race’s market price were exactly right, the average number of seats each side wins equals the sum of its chances across the races. This is arithmetic on the markets’ numbers, not our forecast, and it assumes nothing about how races move together.'],
		shift: ['Shift every race', 'Moves every race toward one side by the same amount on the log-odds scale: a 50-50 race moves by the full number of points, a race at 95% barely moves. A quick way to ask "what if the markets are off in one direction everywhere?"'],
		called: ['Called race', 'A race is "called" when news organisations judge that the trailing side cannot catch up. Official results come later, when states certify them. Here a race is marked once its Polymarket market has settled, which is the market’s reading of the result, not an official one.'],
		tiebreak: ['Tie-breaking vote', 'In a 50-50 Senate the Vice President (JD Vance, a Republican, until January 2029) decides tied votes, so 50 Republican seats give Republicans control.'],
		fptp: ['First past the post', 'Canada and its provinces elect one member per riding: the candidate with the most votes wins, even under 50%. Seat shares can differ a lot from vote shares, especially for parties whose votes are spread thinly.'],
		pr: ['Proportional representation', 'Systems that give each party a share of seats close to its share of the vote. The "what if" panel here applies a simple nationwide version to the actual votes, only to compare; real proportional systems use regions, thresholds and other rules, and people might vote differently under them.'],
		dhondt: ['D’Hondt', 'A way to turn votes into seats: each seat goes to the party with the highest votes ÷ (seats already won + 1). It slightly favours larger parties.'],
		sl: ['Sainte-Laguë', 'Like D’Hondt but divides by 1, 3, 5, 7... (2 × seats + 1). Closer to exact proportionality between large and small parties.'],
		hare: ['Largest remainder (Hare)', 'Each party gets the whole number of seats its votes are worth (votes ÷ votes per seat); the seats left over go to the biggest fractions.'],
		threshold: ['Threshold', 'The share of the vote a party needs before it gets any seats in a proportional system (Germany uses 5%, for example).'],
		majgov: ['Majority government', 'One party holds more than half of the seats (172 of 343 in Ottawa, 47 of 93 in Victoria) and can pass laws alone.'],
		mingov: ['Minority government', 'The largest party governs with fewer than half of the seats and needs votes from other parties to pass laws and survive confidence votes.'],
		coalition: ['Coalition / agreement', 'Parties that together hold a majority can agree to govern together (a coalition) or for one to support the other on key votes (confidence and supply). Shown here are the smallest groups of parties that reach a majority.'],
		initial: ['Initial and final count (BC)', 'Elections BC counts ballots cast in person on election night (initial count). Mail-in and absentee ballots are counted later at the final count, which can change close ridings.'],
		recount: ['Judicial recount', 'In Canada a judge recounts the ballots of a riding when the margin is very small (under 1/1000 of the votes) or when asked with good reason.'],
		byelection: ['By-election', 'An election in one riding between general elections, after a seat becomes vacant or a result is annulled.'],
		popvote: ['Popular vote', 'The share of all valid votes each party received across the country or province.'],
		turnout: ['Turnout', 'Ballots cast as a share of registered electors.'],
		latest: ['Latest legal date', 'Where no fixed date exists, the latest day the election can be held under the law; it is often held earlier.']
	};

	if (typeof module === 'object' && module.exports) module.exports = E; else root.MESElect = E;
})(this);

/* MES Elections UI. Data = /api/elections (one aggregator, edge-cached 5 min); data tables and maths = MESElect (lib.js). ?mock=1 (and local
   previews) read the committed sample mes.fm/elections/data/sample.json instead. Neutral: no forecast of our own anywhere. */
(function () {
	'use strict';
	var E = window.MESElect, $ = function (id) { return document.getElementById(id); }, root = $('el');
	if (!E || !root) return;
	var KEY = 'mes-elections:v1', st = { tab: 'us', ch: 'S', base: 'market', shift: 0, ind: '', picks: { H: {}, S: {}, G: {} }, sort: 'close', ca: 'ca2025', bc: 'bc2026', calg: 'all', pr: 'dhondt', thr: 0, coal: {} };
	var SKEYS = ['tab', 'ch', 'base', 'shift', 'ind', 'picks', 'sort', 'ca', 'bc', 'calg', 'pr', 'thr'];
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); SKEYS.forEach(function (k) { if (sv[k] != null) st[k] = sv[k]; }); } catch (e) {}
	['H', 'S', 'G'].forEach(function (k) { if (!st.picks[k] || typeof st.picks[k] !== 'object') st.picks[k] = {}; });
	var qs = new URLSearchParams(location.search), MOCK = qs.get('mock') === '1' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
	if (qs.get('tab')) st.tab = qs.get('tab');
	if (/^[HSG]$/.test(qs.get('ch') || '')) st.ch = qs.get('ch');
	if (qs.get('sh') && isFinite(+qs.get('sh'))) st.shift = Math.max(-25, Math.min(25, +qs.get('sh')));
	if (qs.get('o') != null) { var dp = E.decodePicks(qs.get('o')); st.picks = { H: {}, S: {}, G: {} }; Object.keys(dp).forEach(function (k) { st.picks[k[0]][k] = dp[k]; }); }
	if (qs.get('base') === 'blank') st.base = 'blank';
	if (/^[DR]?$/.test(qs.get('ind') || '') && qs.get('ind') != null) st.ind = qs.get('ind');
	function save() { try { var o = {}; SKEYS.forEach(function (k) { o[k] = st[k]; }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function q(k) { var g = E.GLOSSARY[k]; return g ? '<button type="button" class="el-q" data-g="' + k + '" aria-label="' + esc('What is ' + g[0] + '?') + '">?</button>' : ''; }
	function src(n) { return data && data.sources[n] && data.sources[n].ok ? data.sources[n].data : null; }
	var data = null, loading = false;
	var PN = { D: 'Democratic', R: 'Republican', I: 'Independent / other', U: 'Not chosen', O: 'Other' };
	var PS = { D: 'D', R: 'R', I: 'I', U: '?', O: 'O' };
	function dlong(ymd) { var d = new Date(E.calTime(ymd)); var s = String(ymd); return isNaN(d) ? s : d.toLocaleDateString(undefined, /^\d{4}$/.test(s) ? { year: 'numeric', timeZone: 'UTC' } : /^\d{4}-\d\d$/.test(s) ? { year: 'numeric', month: 'long', timeZone: 'UTC' } : { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }); }

	// ---------- tabs ----------
	var TABS = ['us', 'ca', 'bc', 'cal'];
	if (TABS.indexOf(st.tab) < 0) st.tab = 'us';
	function showTab(t, focus) {
		st.tab = t; save();
		[].forEach.call($('el-tabs').querySelectorAll('[role=tab]'), function (b) { var on = b.getAttribute('data-tab') === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
		TABS.forEach(function (x) { $('el-p-' + x).hidden = x !== t; });
		drawTab(t);
	}
	$('el-tabs').addEventListener('click', function (e) { var b = e.target.closest('[role=tab]'); if (b) showTab(b.getAttribute('data-tab')); });
	$('el-tabs').addEventListener('keydown', function (e) { var i = TABS.indexOf(st.tab); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); showTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true); } });

	// ---------- glossary popover + tooltip ----------
	var pop = $('el-pop'), popFor = null, tip = $('el-tip');
	function closePop() { pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; }
	root.addEventListener('click', function (e) {
		var b = e.target.closest('.el-q');
		if (b) {
			e.preventDefault(); e.stopPropagation();
			if (popFor === b) return closePop();
			var g = E.GLOSSARY[b.getAttribute('data-g')]; if (!g) return;
			closePop(); popFor = b; b.setAttribute('aria-expanded', 'true');
			pop.querySelector('.el-pop__t').textContent = g[0]; pop.querySelector('.el-pop__p').textContent = g[1]; pop.hidden = false;
			var r = b.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24), left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
			pop.style.width = w + 'px'; pop.style.left = left + 'px';
			var h = pop.offsetHeight, top = r.bottom + 8; if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
			pop.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
			return;
		}
		if (!pop.hidden && !e.target.closest('.el-pop')) closePop();
	});
	pop.querySelector('.el-pop__x').onclick = closePop;
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { var b = popFor; closePop(); if (b) b.focus(); } });
	window.addEventListener('scroll', function () { if (!pop.hidden) closePop(); hideTip(); }, { passive: true });
	function showTip(html, x, y) {
		tip.innerHTML = html; tip.hidden = false;
		var w = tip.offsetWidth, h = tip.offsetHeight;
		tip.style.left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8) + 'px';
		tip.style.top = (y - h - 12 > 8 ? y - h - 12 : y + 18) + 'px';
	}
	function hideTip() { tip.hidden = true; }

	// ---------- countdown hero ----------
	function hero() {
		var now = Date.now(), cd = $('el-cd'), t;
		if (now < E.US_START) t = '<span class="el-cdn">' + esc(E.countdown(E.US_START - now)) + '</span> <span class="el-cdl">until Election Day</span>';
		else if (now < E.US_FIRST_CLOSE) t = '<span class="el-cdn">Voting today</span> <span class="el-cdl">first polls close in ' + esc(E.countdown(E.US_FIRST_CLOSE - now)) + ' (6 pm Eastern)</span>';
		else if (now < E.US_FIRST_CLOSE + 2 * 864e5) t = '<span class="el-cdn">Counting</span> <span class="el-cdl">polls are closed or closing; official results come from each state</span>';
		else t = '<span class="el-cdn">Held 3 Nov 2026</span> <span class="el-cdl">states certify results in the following weeks</span>';
		cd.innerHTML = t;
		var up = E.upcoming(now).filter(function (r) { return r[0] !== E.US_DAY; })[0];
		if (up) { var dd = Math.ceil((E.calTime(up[0]) - now) / 864e5); $('el-next').innerHTML = 'Next on the calendar: <b>' + esc(up[3]) + '</b>, ' + esc(up[4].replace(/\s*\(.*$/, '')) + ' &middot; ' + esc(dlong(up[0])) + (dd > 0 ? ' (in ' + dd + ' day' + (dd === 1 ? '' : 's') + ')' : dd === 0 ? ' (today)' : ''); }
	}
	hero(); setInterval(hero, 1000);

	// hemicycle point (unit box 0..1 x 0..0.5) -> SVG coordinates in a 600 x 330 box with a margin, radius in px
	var AW = 600, AH = 330, AP = 12;
	function axy(p) { var k = AW - 2 * AP; return { x: (AP + p.x * k).toFixed(1), y: (AP + p.y * k).toFixed(1), r: (p.r * k * 0.98).toFixed(2) }; }

	// ---------- data ----------
	function load(force) {
		if (loading) return; loading = true;
		var url = MOCK ? '/elections/data/sample.json' : '/api/elections' + (force ? '?t=' + Date.now() : '');
		fetch(url, { cache: force ? 'reload' : 'default' }).then(function (r) { if (!r.ok && r.status !== 502) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
			loading = false; data = j; status(''); drawAll();
		}).catch(function (e) {
			loading = false;
			if (!MOCK) { MOCK = true; return load(); }
			status('Could not load live data (' + e.message + '). The Canada, BC and calendar tabs still work.', true); drawAll();
		});
	}
	function status(t, bad) { var s = $('el-status'); s.hidden = !t; s.textContent = t; s.classList.toggle('err', !!bad); }
	$('el-refresh').onclick = function () { load(true); };

	function races(k) { var r = src('races'); return r ? r.races[k] || [] : []; }
	function info(k, st0) { var a = k === 'S' ? E.SENATE_2026 : k === 'G' ? E.GOV_2026 : []; for (var i = 0; i < a.length; i++) if (a[i][0] === st0) return a[i]; return null; }
	function cur() {
		var rs = races(st.ch), o = E.outcome(rs, { picks: st.picks[st.ch], base: st.base, shift: -st.shift }), expect = st.ch === 'H' ? 435 : st.ch === 'S' ? 35 : 36;
		return { rs: rs, o: o, t: E.chamber(st.ch, o.n, st.ind, Math.max(0, expect - rs.length)) };
	}

	// ---------- US: summary cards ----------
	function oddsRow(label, d, r, url, extra) {
		if (d == null && r == null) return '';
		return '<a class="el-odds" href="' + esc(url) + '" target="_blank" rel="noopener"><span class="el-odds__l">' + label + '</span><span class="el-odds__bar" aria-hidden="true"><i class="el-bg-D" style="width:' + (d || 0) + '%"></i><i class="el-bg-R" style="width:' + (r || 0) + '%"></i></span><span class="el-odds__v"><b class="el-tx-D">D ' + E.pct(d) + '</b> <b class="el-tx-R">R ' + E.pct(r) + '</b></span>' + (extra ? '<small>' + extra + '</small>' : '') + '</a>';
	}
	function pmCtl(id) { var ov = src('races'), e = ov && ov.overview[id]; if (!e) return null; var o = { url: e.url, vol: e.vol }; e.oc.forEach(function (x) { if (/democrat/i.test(x.l)) o.D = x.p; if (/republican/i.test(x.l)) o.R = x.p; }); return o; }
	function usCards() {
		var H = E.HOUSE.now, S = E.SENATE.now, G = E.GOV.now, out = [];
		function card(title, g, nowBar, facts, odds) {
			return '<div class="tu-card el-ucard"><h3>' + title + ' ' + q(g) + '</h3>' + nowBar + '<ul class="el-facts">' + facts.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' + (odds ? '<div class="el-oddsbox"><span class="el-ctrl__l">Who wins control, as markets price it</span>' + odds + '</div>' : '') + '</div>';
		}
		function bar(parts, total, maj) {
			var x = 0, h = parts.map(function (p) { var w = p[1] / total * 100, s = '<i class="el-bg-' + p[0] + '" style="left:' + x + '%;width:' + w + '%" title="' + esc(PN[p[0]] || p[2]) + ': ' + p[1] + '"></i>'; x += w; return s; }).join('');
			return '<div class="el-nowbar" role="img" aria-label="' + esc(parts.map(function (p) { return (p[2] || PN[p[0]]) + ' ' + p[1]; }).join(', ')) + '">' + h + (maj ? '<b class="el-maj" style="left:' + (maj / total * 100) + '%"></b>' : '') + '</div><div class="el-nowlab">' + parts.map(function (p) { return '<span><i class="el-sw el-bg-' + p[0] + '"></i>' + esc(p[2] || PN[p[0]]) + ' ' + p[1] + '</span>'; }).join('') + '</div>';
		}
		var kh = src('kalshiH'), ks = src('kalshiS'), ph = pmCtl('house'), ps = pmCtl('senate');
		out.push(card('House', 'house', bar([['D', H.D], ['I', H.I, 'Independent'], ['U', H.V, 'Vacant'], ['R', H.R]], 435, 218),
			['All <b>435</b> seats on the ballot', '<b>218</b> for a majority', 'Now: R ' + H.R + ', D ' + H.D + ', I ' + H.I + ', ' + H.V + ' vacant'],
			(ph ? oddsRow('Polymarket', ph.D, ph.R, ph.url, '$' + E.fmt(ph.vol / 1e6, 1) + 'M traded') : '') + (kh ? oddsRow('Kalshi', kh.D, kh.R, kh.url, E.fmt(kh.contracts / 1e6, 1) + 'M contracts') : '')));
		out.push(card('Senate', 'senate', bar([['D', S.D], ['I', S.I, 'Independent (caucus D)'], ['R', S.R]], 100, 51),
			['<b>35</b> seats on the ballot (2 specials ' + q('special') + ')', '<b>51</b> for a majority, or 50 + Vice President (R) ' + q('tiebreak'), 'Not on the ballot: R ' + E.SENATE.hold.R + ', D ' + E.SENATE.hold.D + ', I ' + E.SENATE.hold.I],
			(ps ? oddsRow('Polymarket', ps.D, ps.R, ps.url, '$' + E.fmt(ps.vol / 1e6, 1) + 'M traded') : '') + (ks ? oddsRow('Kalshi', ks.D, ks.R, ks.url, E.fmt(ks.contracts / 1e6, 1) + 'M contracts') : '')));
		out.push(card('Governors', 'governor', bar([['D', G.D], ['R', G.R]], 50, 0),
			['<b>36</b> races', 'Now: R ' + G.R + ', D ' + G.D, 'Not on the ballot: R ' + E.GOV.hold.R + ', D ' + E.GOV.hold.D], ''));
		$('el-us-cards').innerHTML = out.join('');
	}

	// ---------- US: builder ----------
	function segSet(id, v) { [].forEach.call($(id).querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === String(v))); }); }
	function segOn(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b) fn(b.getAttribute('data-v')); }); }
	segOn('el-ch', function (v) { st.ch = v; st.find = ''; $('el-find').value = ''; shown = 30; save(); drawBuild(); });
	segOn('el-base', function (v) { st.base = v; save(); drawBuild(); });
	segOn('el-sort', function (v) { st.sort = v; shown = 30; save(); drawList(); });
	$('el-shift').addEventListener('input', function () { st.shift = +this.value; save(); drawBuild(true); });
	$('el-ind').addEventListener('change', function () { st.ind = this.value; save(); drawBuild(); });
	$('el-reset').onclick = function () { st.picks[st.ch] = {}; st.shift = 0; st.base = 'market'; st.ind = ''; save(); drawBuild(); };
	$('el-share').onclick = function () {
		var u = new URL(location.href.split('?')[0]); u.searchParams.set('tab', 'us'); u.searchParams.set('ch', st.ch);
		var p = E.encodePicks(st.picks[st.ch]); if (p) u.searchParams.set('o', p);
		if (st.shift) u.searchParams.set('sh', st.shift); if (st.base === 'blank') u.searchParams.set('base', 'blank'); if (st.ind) u.searchParams.set('ind', st.ind);
		var b = this, done = function () { b.textContent = 'Link copied'; setTimeout(function () { b.textContent = 'Copy link'; }, 1600); };
		if (navigator.clipboard) navigator.clipboard.writeText(u.toString()).then(done, function () { prompt('Copy this link', u.toString()); }); else prompt('Copy this link', u.toString());
	};
	var CYCLE = ['D', 'R', 'I', 'U'];
	function cyclePick(key) {
		var c = cur(), now = c.o.by[key], p = st.picks[st.ch], nx = CYCLE[(CYCLE.indexOf(now) + 1) % CYCLE.length];
		var r = c.rs.filter(function (x) { return x.key === key; })[0];
		if (!r) return;
		// back to the market's side = no override
		var mk = st.base === 'blank' && !r.res ? 'U' : E.favourite(r, -st.shift);
		if (nx === mk) delete p[key]; else p[key] = nx;
		save(); drawBuild();
	}
	function setPick(key, v) {
		var p = st.picks[st.ch];
		if (v === 'M') delete p[key]; else p[key] = v;
		save(); drawBuild();
	}
	function lean(r) { if (!r || r.res) return false; var s = E.shifted(r.pD, r.pR, -st.shift), m = Math.max(s.D, s.R, r.pO || 0); return m < 65; }
	function verdict(t) {
		var who = t.ctl === 'D' ? 'Democrats' : t.ctl === 'R' ? 'Republicans' : null, k = st.ch;
		if (k === 'G') return '<b>' + (t.D > t.R ? 'More Democratic governors' : t.R > t.D ? 'More Republican governors' : 'Tied') + '</b>: D ' + t.D + ', R ' + t.R + (t.I ? ', I ' + t.I : '') + (t.U ? ', ' + t.U + ' not chosen' : '');
		if (!who) return '<b>No majority yet</b>: Democrats need ' + t.need.D + ' more, Republicans ' + t.need.R + ' more' + (k === 'S' ? ' (50 is enough for Republicans, with the Vice President)' : '') + '.';
		return '<b>' + who + ' control the ' + (k === 'H' ? 'House' : 'Senate') + '</b>' + (t.note ? ' (' + esc(t.note) + ')' : '') + '.';
	}
	function drawResult(c) {
		var t = c.t, k = st.ch, tot = t.total, segs = [['D', t.Dcaucus - (k === 'S' ? t.Ihold : 0) - (st.ind === 'D' ? t.I : 0)], ['Ih', k === 'S' ? t.Ihold : 0], ['I', t.I], ['U', t.U], ['R', t.R]];
		var x = 0, h = segs.map(function (s) { if (!s[1]) return ''; var w = s[1] / tot * 100, cl = s[0] === 'Ih' ? 'I' : s[0], o = '<i class="el-bg-' + cl + (s[0] === 'Ih' ? ' el-hatch' : '') + '" style="left:' + x + '%;width:' + w + '%"></i><span class="el-rb__n" style="left:' + (x + w / 2) + '%">' + (w > 4 ? s[1] : '') + '</span>'; x += w; return o; }).join('');
		var lab = k === 'S' ? 'Senate seats (all 100)' : k === 'H' ? 'House seats' : 'Governors (all 50)';
		$('el-result').innerHTML = '<div class="el-rb" role="img" aria-label="' + esc(lab + ': D ' + t.Dcaucus + ', R ' + t.Rcaucus) + '">' + h + (k !== 'G' ? '<b class="el-maj" style="left:' + (t.majority / tot * 100) + '%"><span>' + t.majority + '</span></b>' : '<b class="el-maj el-maj--half" style="left:50%"></b>') + '</div>' +
			'<div class="el-verdict">' + verdict(t) + '</div><div class="el-rnums"><span class="el-tx-D">D ' + (k === 'S' ? t.D + ' + ' + t.Ihold + ' I' : t.D) + '</span>' + (t.I ? '<span class="el-tx-I">New I ' + t.I + '</span>' : '') + (t.U ? '<span class="el-tx-U">Not chosen ' + t.U + '</span>' : '') + '<span class="el-tx-R">R ' + t.R + '</span>' +
			(k === 'S' ? '<span class="el-tx-U">(includes ' + (E.SENATE.hold.D + E.SENATE.hold.R + E.SENATE.hold.I) + ' seats not on the ballot)</span>' : k === 'G' ? '<span class="el-tx-U">(includes 14 not on the ballot)</span>' : '') + '</div>';
	}
	// parliament arc of every seat (Senate: the 65 not on the ballot first, greyed); click a dot to flip that race
	function drawArc(c) {
		var k = st.ch, box = $('el-arc');
		if (k === 'G') { $('el-arcwrap').hidden = true; return; }
		$('el-arcwrap').hidden = false;
		var seats = [], ord = { D: 0, I: 2, U: 3, R: 5 };
		c.rs.forEach(function (r) { var o = c.o.by[r.key], s = E.shifted(r.pD, r.pR, -st.shift); seats.push({ r: r, o: o, sort: ord[o] + (o === 'D' ? 1 - s.D / 100 : o === 'R' ? s.D / 100 : 0.5) }); });
		if (k === 'S') {
			for (var i = 0; i < E.SENATE.hold.D; i++) seats.push({ o: 'D', hold: 1, sort: -1 });
			for (i = 0; i < E.SENATE.hold.I; i++) seats.push({ o: 'I', hold: 1, sort: ord[st.ind === 'R' ? 'R' : 'D'] + 0.95, hi: 1 });
			for (i = 0; i < E.SENATE.hold.R; i++) seats.push({ o: 'R', hold: 1, sort: 7 });
		}
		var miss = (k === 'H' ? 435 : 0) - (k === 'H' ? c.rs.length : 0); for (i = 0; i < miss; i++) seats.push({ o: 'U', sort: 3.5 });
		if (st.ind === 'D') seats.forEach(function (s) { if (s.o === 'I' && !s.hold) s.sort = 1.5; }); else if (st.ind === 'R') seats.forEach(function (s) { if (s.o === 'I' && !s.hold) s.sort = 4.5; });
		seats.sort(function (a, b) { return a.sort - b.sort; });
		var pts = E.hemicycle(seats.length), W = AW, H = AH, out = [];
		pts.forEach(function (p, j) {
			var s = seats[j], r = s.r, cls = 'el-dot el-fl-' + (s.hi ? 'I' : s.o) + (s.hold ? ' el-hold' : '') + (r && st.picks[k][r.key] ? ' el-mine' : '') + (r && r.res ? ' el-settled' : '') + (r && lean(r) && !st.picks[k][r.key] && s.o !== 'U' ? ' el-lean' : '');
			var q2 = axy(p); out.push('<circle class="' + cls + '" cx="' + q2.x + '" cy="' + q2.y + '" r="' + q2.r + '"' + (r ? ' data-k="' + r.key + '" tabindex="-1"' : '') + '></circle>');
		});
		var t = c.t;
		out.push('<text class="el-arcn" x="' + W / 2 + '" y="' + (H - 58) + '" text-anchor="middle">' + (t.ctl ? (t.ctl === 'D' ? 'D' : 'R') + ' control' : 'No majority') + '</text><text class="el-arcs" x="' + W / 2 + '" y="' + (H - 34) + '" text-anchor="middle">' + t.Dcaucus + ' – ' + t.Rcaucus + '  ·  ' + t.majority + ' needed</text>');
		box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc((k === 'H' ? 'House' : 'Senate') + ' seats, ' + t.Dcaucus + ' D side, ' + t.Rcaucus + ' R side') + '">' + out.join('') + '</svg>';
	}
	function raceTip(r, o) {
		var i = info(r.kind, r.st), c = r.c.map(function (x) { return '<span class="el-tx-' + (x.pt === 'O' ? 'I' : x.pt) + '">' + esc(x.n) + (x.pt !== 'O' && !/Party$/.test(x.n) ? ' (' + x.pt + ')' : '') + ' ' + E.pct(x.p, 0) + '</span>'; }).join('<br>');
		return '<b>' + esc(E.raceLabel(r)) + (r.kind === 'S' ? ' Senate' : r.kind === 'G' ? ' Governor' : '') + '</b>' + (i ? '<br><small>Now: ' + esc(i[1]) + ' (' + i[2] + '), ' + esc(i[3].toLowerCase()) + '</small>' : '') + '<br>' + c + (r.res ? '<br><b>Market settled: ' + PN[r.res] + '</b>' : '') + '<br><small>Your map: ' + PN[o] + (st.picks[r.kind][r.key] ? ' (your choice)' : '') + '. Click to change.</small>';
	}
	$('el-arc').addEventListener('click', function (e) { var d = e.target.closest('[data-k]'); if (d) { cyclePick(d.getAttribute('data-k')); } });
	function tipFrom(e) {
		var d = e.target.closest && e.target.closest('[data-k]'); if (!d || !root.contains(d)) return hideTip();
		var c = cur(), key = d.getAttribute('data-k'), r = c.rs.filter(function (x) { return x.key === key; })[0];
		if (r) showTip(raceTip(r, c.o.by[key]), e.clientX, e.clientY);
		else if (d.getAttribute('data-st')) showTip(stateTip(d.getAttribute('data-st')), e.clientX, e.clientY);
	}
	['el-arc', 'el-map'].forEach(function (id) { $(id).addEventListener('pointermove', tipFrom); $(id).addEventListener('pointerleave', hideTip); });
	// tile map: Senate / governor = one race per state (click flips it); House = the state's districts as a split bar (click lists them)
	function stateTip(s) {
		var c = cur(), rs = c.rs.filter(function (r) { return r.st === s; }), n = { D: 0, R: 0, I: 0, U: 0 };
		rs.forEach(function (r) { n[c.o.by[r.key]]++; });
		return '<b>' + esc(E.STATES[s]) + '</b><br>' + rs.length + ' House seat' + (rs.length === 1 ? '' : 's') + ': D ' + n.D + ', R ' + n.R + (n.I ? ', I ' + n.I : '') + (n.U ? ', not chosen ' + n.U : '') + '<br><small>Click to list its races.</small>';
	}
	function drawMap(c) {
		var k = st.ch, by = {}, out = [];
		c.rs.forEach(function (r) { (by[r.st] = by[r.st] || []).push(r); });
		Object.keys(E.TILES).forEach(function (s) {
			var p = E.TILES[s], rs = by[s] || [], pos = 'grid-column:' + (p[0] + 1) + ';grid-row:' + (p[1] + 1);
			if (k === 'H') {
				if (s === 'DC') { out.push('<span class="el-tile el-tile--off" style="' + pos + '" title="DC has a non-voting delegate">DC</span>'); return; }
				var n = { D: 0, R: 0, I: 0, U: 0 }; rs.forEach(function (r) { n[c.o.by[r.key]]++; }); var t = rs.length || 1;
				out.push('<button type="button" class="el-tile el-tile--h' + (st.find === s ? ' el-tile--sel' : '') + '" style="' + pos + '" data-st="' + s + '" data-k="" aria-label="' + esc(E.STATES[s] + ': D ' + n.D + ', R ' + n.R) + '"><span class="el-tile__s">' + s + '</span><span class="el-tile__b"><i class="el-bg-D" style="width:' + n.D / t * 100 + '%"></i><i class="el-bg-I" style="width:' + n.I / t * 100 + '%"></i><i class="el-bg-U" style="width:' + n.U / t * 100 + '%"></i><i class="el-bg-R" style="width:' + n.R / t * 100 + '%"></i></span><span class="el-tile__n">' + (rs.length > 1 ? n.D + '–' + n.R : '') + '</span></button>');
				return;
			}
			var r = rs[0];
			if (!r) { out.push('<span class="el-tile el-tile--off" style="' + pos + '" title="' + esc((E.STATES[s] || s) + ': no race in 2026') + '">' + s + '</span>'); return; }
			var o = c.o.by[r.key];
			out.push('<button type="button" class="el-tile el-fl-' + o + (lean(r) && !st.picks[k][r.key] && o !== 'U' ? ' el-lean' : '') + (st.picks[k][r.key] ? ' el-mine' : '') + (r.res ? ' el-settled' : '') + '" style="' + pos + '" data-k="' + r.key + '" aria-label="' + esc(E.STATES[s] + ': ' + PN[o] + '. Click to change.') + '"><span class="el-tile__s">' + s + '</span><span class="el-tile__n">' + (o === 'U' ? '?' : o) + '</span></button>');
		});
		$('el-map').innerHTML = out.join('');
		$('el-maplegend').innerHTML = k === 'H' ? 'Each state shows its House seats split by party in your map. Click a state to list its races; click again to show all.' : 'Grey: no ' + (k === 'S' ? 'Senate' : 'governor') + ' race this year. Click a state to change its winner (D, R, independent, not chosen).';
	}
	$('el-map').addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b) return;
		if (st.ch === 'H') { var s = b.getAttribute('data-st'); st.find = st.find === s ? '' : s; $('el-find').value = st.find ? E.STATES[s] : ''; shown = 60; drawMap(cur()); drawList(); return; }
		cyclePick(b.getAttribute('data-k'));
	});
	function legend() {
		$('el-legend').innerHTML = '<span><i class="el-sw el-bg-D"></i>Democratic</span><span><i class="el-sw el-bg-R"></i>Republican</span><span><i class="el-sw el-bg-I"></i>Independent / other</span><span><i class="el-sw el-bg-U"></i>Not chosen</span><span><i class="el-sw el-bg-D el-lean"></i>Paler: market favourite under 65%</span><span><i class="el-sw el-ring"></i>Ringed: your choice</span>' + (st.ch === 'S' ? '<span><i class="el-sw el-bg-U el-holdsw"></i>Faded: not on the ballot</span>' : '');
	}
	var shown = 30;
	function drawList() {
		var c = cur(), k = st.ch, f = String($('el-find').value || '').trim().toLowerCase(), rs = c.rs.slice();
		if (st.find && f === String(E.STATES[st.find] || '').toLowerCase()) rs = rs.filter(function (r) { return r.st === st.find; });
		else if (f) rs = rs.filter(function (r) { var i = info(r.kind, r.st); return (E.raceLabel(r) + ' ' + E.STATES[r.st] + ' ' + r.st + '-' + (r.dist || '') + ' ' + r.c.map(function (x) { return x.n; }).join(' ') + ' ' + (i ? i[1] : '')).toLowerCase().indexOf(f) >= 0; });
		if (st.sort === 'mine') rs = rs.filter(function (r) { return st.picks[k][r.key]; });
		rs.sort(st.sort === 'close' ? function (a, b) { var s1 = E.shifted(a.pD, a.pR, -st.shift), s2 = E.shifted(b.pD, b.pR, -st.shift); return (a.res ? 999 : Math.abs(s1.D - s1.R)) - (b.res ? 999 : Math.abs(s2.D - s2.R)); } : function (a, b) { return E.raceLabel(a) < E.raceLabel(b) ? -1 : 1; });
		var total = rs.length, list = rs.slice(0, shown);
		$('el-list').innerHTML = list.length ? list.map(function (r) {
			var o = c.o.by[r.key], i = info(r.kind, r.st), s = E.shifted(r.pD, r.pR, -st.shift), mine = st.picks[k][r.key];
			var names = r.c.filter(function (x) { return x.p >= 1 || /Party$/.test(x.n); }).slice(0, 3).map(function (x) { var pt = x.pt === 'O' ? 'I' : x.pt; return '<span class="el-cand el-tx-' + pt + '">' + esc(x.n) + (x.pt !== 'O' && !/Party$/.test(x.n) ? ' <small>(' + x.pt + ')</small>' : '') + ' <b>' + E.pct(x.p, 0) + '</b></span>'; }).join('');
			var btn = function (v, l) { return '<button type="button" class="el-pk el-pk-' + v + '" data-pk="' + v + '" aria-pressed="' + (v === 'M' ? String(!mine) : String(mine === v)) + '">' + l + '</button>'; };
			return '<div class="el-row' + (mine ? ' el-row--mine' : '') + '" data-k="' + r.key + '"><div class="el-row__h"><span class="el-chip el-bg-' + o + '">' + PS[o] + '</span><b>' + esc(E.raceLabel(r)) + '</b>' + (i ? '<small class="el-inc">Now ' + esc(i[1]) + ' (' + i[2] + ') · ' + esc(i[3]) + (i[4] ? ' · special' : '') + '</small>' : '') + (r.res ? '<small class="el-settledtag">Market settled: ' + PN[r.res] + '</small>' : '') + '<a class="el-mk" href="' + esc(r.url) + '" target="_blank" rel="noopener" title="Open this market on Polymarket">market &#8599;</a></div>' +
				'<div class="el-row__b"><span class="el-split" title="Normalised market shares' + (st.shift ? ' after your shift' : '') + '"><i class="el-bg-D" style="width:' + s.D + '%"></i><i class="el-bg-I" style="width:' + (r.pO || 0) + '%"></i><i class="el-bg-R" style="width:' + s.R + '%"></i></span><span class="el-cands">' + names + '</span></div>' +
				'<div class="el-row__p" role="group" aria-label="Choose the winner">' + btn('M', 'Market') + btn('D', 'D') + btn('R', 'R') + btn('I', 'I') + btn('U', '?') + '</div></div>';
		}).join('') : '<p class="tu-note">' + (st.sort === 'mine' ? 'You have not changed any race yet. Click a seat, a state or a race.' : rs.length || !races(k).length ? 'No race matches.' : 'No race markets loaded.') + '</p>';
		$('el-more').innerHTML = total > shown ? '<button type="button" class="tu-btn tu-btn--ghost" id="el-morebtn">Show ' + Math.min(60, total - shown) + ' more (' + (total - shown) + ' left)</button>' : (total ? '<span class="tu-note">' + total + ' race' + (total === 1 ? '' : 's') + '</span>' : '');
	}
	$('el-more').addEventListener('click', function (e) { if (e.target.id === 'el-morebtn') { shown += 60; drawList(); } });
	$('el-find').addEventListener('input', function () { st.find = ''; shown = 30; drawList(); drawMap(cur()); });
	$('el-list').addEventListener('click', function (e) { var b = e.target.closest('[data-pk]'); if (!b) return; setPick(b.closest('[data-k]').getAttribute('data-k'), b.getAttribute('data-pk')); });
	function drawBuild(fromSlider) {
		segSet('el-ch', st.ch); segSet('el-base', st.base); segSet('el-sort', st.sort);
		$('el-shift').value = st.shift; $('el-ind').value = st.ind;
		$('el-shiftv').textContent = st.shift ? Math.abs(st.shift) + ' pts toward ' + (st.shift < 0 ? 'D' : 'R') : 'none';
		var c = cur();
		// the slider runs D (left) to R (right); internally + = toward D
		if (!c.rs.length) { $('el-result').innerHTML = '<p class="tu-note">Race markets did not load. Try Refresh.</p>'; }
		drawResult(c); drawArc(c); drawMap(c); legend();
		if (!fromSlider || st.sort === 'close') drawList(); else drawList();
		var sm = E.sumShares(c.rs), ex = st.ch === 'S' ? ' (+' + (E.SENATE.hold.D + E.SENATE.hold.I) + ' D/I and ' + E.SENATE.hold.R + ' R not on the ballot)' : st.ch === 'G' ? ' (+' + E.GOV.hold.D + ' D and ' + E.GOV.hold.R + ' R not on the ballot)' : '';
		$('el-sumnote').innerHTML = c.rs.length ? 'Adding up each race&rsquo;s market share ' + q('sum') + ': D &asymp; ' + sm.D + ', R &asymp; ' + sm.R + (sm.O ? ', others &asymp; ' + sm.O : '') + ' of the ' + c.rs.length + ' races' + ex + '. Prices: Polymarket ' + q('shares') + '.' : '';
	}

	// ---------- US: overview markets, results links, context ----------
	function drawOverview() {
		var ov = src('races') ? src('races').overview : {}, out = [];
		function block(id, title, note) {
			var e = ov[id]; if (!e) return;
			var mx = Math.max.apply(null, e.oc.map(function (o) { return o.p; }));
			out.push('<div class="el-ovb"><a href="' + esc(e.url) + '" target="_blank" rel="noopener"><b>' + esc(title || e.title) + '</b> &#8599;</a><small>Polymarket · $' + E.fmt(e.vol / 1e6, 1) + 'M traded' + (note ? ' · ' + note : '') + '</small><ul>' + e.oc.map(function (o) {
				var cl = /^d |democrat/i.test(o.l) ? 'D' : /^r |republican/i.test(o.l) ? 'R' : 'N';
				return '<li><span class="el-ovl">' + esc(o.l) + '</span><span class="el-ovbar"><i class="el-bg-' + (cl === 'N' ? 'N' : cl) + '" style="width:' + (o.p / Math.max(mx, 1) * 100) + '%"></i></span><b>' + E.pct(o.p) + '</b></li>';
			}).join('') + '</ul></div>');
		}
		block('balance', 'Balance of power after the midterms');
		block('rsenseats', 'Republican Senate seats after the midterms', 'each bracket priced separately');
		block('rgovs', 'Republican governors after the midterms', 'each bracket priced separately');
		$('el-ovgrid').innerHTML = out.join('') || '<p class="tu-note">These markets did not load right now.</p>';
	}
	function drawLinks() {
		var f = String($('el-sfind').value || '').toLowerCase();
		$('el-slinks').innerHTML = Object.keys(E.RESULTS_URLS).filter(function (s) { return !f || (E.STATES[s] + ' ' + s).toLowerCase().indexOf(f) >= 0; }).sort(function (a, b) { return E.STATES[a] < E.STATES[b] ? -1 : 1; }).map(function (s) {
			return '<a href="' + esc(E.RESULTS_URLS[s]) + '" target="_blank" rel="noopener"><b>' + s + '</b> ' + esc(E.STATES[s]) + '</a>';
		}).join('');
	}
	$('el-sfind').addEventListener('input', drawLinks);
	function drawCtx() {
		var H = E.HOUSE.now;
		$('el-now').innerHTML = '<ul class="el-ul"><li>House: R ' + H.R + ', D ' + H.D + ', I ' + H.I + ' (Kevin Kiley, CA-03), ' + H.V + ' vacant (FL-20, TX-23).</li><li>Senate: R ' + E.SENATE.now.R + ', D ' + E.SENATE.now.D + ', I ' + E.SENATE.now.I + ' (Bernie Sanders, Angus King; both caucus with the Democrats). Vice President: ' + E.SENATE.vpName + ' (R).</li><li>Governors: R ' + E.GOV.now.R + ', D ' + E.GOV.now.D + '.</li><li>Open Senate seats ' + q('open') + ': ' + E.SENATE_2026.filter(function (x) { return !/^Running/.test(x[3]); }).map(function (x) { return x[0]; }).join(', ') + '.</li></ul>';
		$('el-redis').innerHTML = E.REDISTRICT.map(function (r) { return '<li><b>' + esc(E.STATES[r[0]]) + '</b>: ' + esc(r[1]) + '</li>'; }).join('') + '<li>Missouri and Virginia: new maps were blocked for 2026.</li>';
		$('el-ussrc').innerHTML = 'Checked ' + esc(E.CHECKED) + ': ' + E.SOURCES_US.map(function (s) { return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener">' + esc(s[0]) + '</a>'; }).join(' · ');
	}

	// ---------- Canada / BC: parliament renderer ----------
	function arcFor(parties, total, majority, opts) {
		opts = opts || {}; var seats = [];
		parties.forEach(function (p) { for (var i = 0; i < (p.s || 0); i++) seats.push(p); });
		while (seats.length < total) seats.push({ k: 'VAC', n: 'Vacant', col: '#c4c9d0' });
		var pts = E.hemicycle(total), W = AW, H = AH, out = [];
		pts.forEach(function (pt, j) { var p = seats[j], q2 = axy(pt); out.push('<circle cx="' + q2.x + '" cy="' + q2.y + '" r="' + q2.r + '" fill="' + p.col + '" data-p="' + esc(p.k) + '"' + (opts.dim && opts.dim[p.k] ? ' opacity="0.25"' : '') + '></circle>'); });
		out.push('<text class="el-arcn" x="' + W / 2 + '" y="' + (H - 58) + '" text-anchor="middle">' + total + ' seats</text><text class="el-arcs" x="' + W / 2 + '" y="' + (H - 34) + '" text-anchor="middle">' + majority + ' for a majority</text>');
		return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(parties.filter(function (p) { return p.s; }).map(function (p) { return p.n + ' ' + p.s; }).join(', ')) + '">' + out.join('') + '</svg>';
	}
	function sw(col) { return '<i class="el-sw" style="background:' + col + '"></i>'; }
	function partyTable(D) {
		var mx = Math.max.apply(null, D.parties.map(function (p) { return Math.max(p.pc, p.s / D.seats * 100); }));
		return '<div class="el-ptab" role="table"><div class="el-ptr el-pth" role="row"><span role="columnheader">Party</span><span role="columnheader">Seats</span><span role="columnheader">' + (D.noVotes ? '' : 'Votes ' + q('popvote')) + '</span><span role="columnheader">' + (D.noVotes ? 'Seat share' : 'Seat share vs vote share') + '</span></div>' +
			D.parties.map(function (p) { var ss = p.s / D.seats * 100; return '<div class="el-ptr" role="row"><span role="cell">' + sw(p.col) + esc(p.n) + (p.only ? ' <small>' + esc(p.only) + '</small>' : '') + '</span><span role="cell"><b>' + p.s + '</b></span><span role="cell">' + (p.v ? E.fmt(p.v) + ' <small>' + E.fmt(p.pc, 2) + '%</small>' : '–') + '</span><span role="cell" class="el-sv"><span class="el-svb"><i style="width:' + (ss / mx * 100) + '%;background:' + p.col + '"></i></span>' + (D.noVotes ? '' : '<span class="el-svb el-svb--v"><i style="width:' + (p.pc / mx * 100) + '%;background:' + p.col + '"></i></span>') + '<small>' + E.fmt(ss, 1) + '% of seats' + (D.noVotes ? '' : ' · ' + E.fmt(p.pc, 1) + '% of votes') + '</small></span></div>'; }).join('') + '</div>';
	}
	function drawParl(boxId, D, extra) {
		var big = D.parties.slice().sort(function (a, b) { return b.s - a.s; })[0], maj = big.s >= D.majority;
		var head = '<div class="tu-card el-parl" id="' + boxId + '-card"><div class="el-chead"><h2>' + esc(D.title) + '</h2></div>' +
			'<p class="tu-note">' + esc(D.status) + (D.prelim ? ' <b>Numbers may change.</b>' : '') + ' ' + q(D.prelim ? 'initial' : 'fptp') + '</p>' +
			'<div class="el-pres"><div class="el-parlarc">' + arcFor(D.parties, D.seats, D.majority) + '</div><div class="el-pside"><div class="el-big">' + esc(big.n) + ': ' + big.s + ' of ' + D.seats + '</div><p>' + (maj ? 'A majority ' + q('majgov') + ' (' + D.majority + ' needed).' : 'Short of a majority by ' + (D.majority - big.s) + ' ' + q('mingov') + '.') + '</p>' +
			(D.turnout ? '<p class="tu-note">Turnout ' + q('turnout') + ': ' + E.fmt(D.turnout, 2) + '%' + (D.votes ? ' · ' + E.fmt(D.votes) + ' valid votes' : '') + '</p>' : '') + '</div></div>' + partyTable(D) +
			(D.notes ? '<ul class="el-ul el-notes">' + D.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') +
			(D.sources ? '<p class="tu-note">Sources: ' + D.sources.map(function (s) { return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener">' + esc(s[0]) + '</a>'; }).join(' · ') + '</p>' : '') + '</div>';
		$(boxId).innerHTML = head + (extra === false ? '' : whatIf(D, boxId) + coalCard(D, boxId));
		addPanels();
	}
	// what if seats followed the vote
	function whatIf(D, id) {
		var pr = E.proportional(D.parties, D.seats, st.pr, st.thr), ps = D.parties.map(function (p) { return { k: p.k, n: p.n, col: p.col, s: pr[p.k] || 0, v: p.v, pc: p.pc }; });
		var prMaj = ps.filter(function (p) { return p.s >= D.majority; })[0];
		return '<div class="tu-card el-whatif" id="' + id + '-wi"><div class="el-chead"><h2>What if seats followed the vote? ' + q('pr') + '</h2></div>' +
			'<div class="el-ctrls"><div class="el-ctrl"><span class="el-ctrl__l">Method</span><div class="tu-seg el-prm" data-v="' + st.pr + '"><button type="button" data-v="dhondt" aria-pressed="' + (st.pr === 'dhondt') + '">D&rsquo;Hondt</button><button type="button" data-v="sl" aria-pressed="' + (st.pr === 'sl') + '">Sainte-Lagu&euml;</button><button type="button" data-v="hare" aria-pressed="' + (st.pr === 'hare') + '">Largest remainder</button></div> ' + q(st.pr === 'sl' ? 'sl' : st.pr === 'hare' ? 'hare' : 'dhondt') + '</div>' +
			'<div class="el-ctrl el-ctrl--shift"><label class="el-ctrl__l">Threshold ' + q('threshold') + '</label><div class="el-shiftrow"><input type="range" class="el-thr" min="0" max="10" step="0.5" value="' + st.thr + '" aria-label="Threshold in percent"><output>' + E.fmt(st.thr, 1) + '%</output><button type="button" class="tu-btn tu-btn--ghost el-thr0">Reset</button></div></div></div>' +
			'<div class="el-pres"><div class="el-parlarc">' + arcFor(ps, D.seats, D.majority) + '</div><div class="el-pside"><ul class="el-cmp">' + D.parties.map(function (p) { var a = pr[p.k] || 0, d = a - p.s; return '<li>' + sw(p.col) + '<span>' + esc(p.n) + '</span><b>' + a + '</b><small>' + (d ? (d > 0 ? '+' : '') + d + ' vs actual' : 'same') + '</small></li>'; }).join('') + '</ul><p>' + (prMaj ? esc(prMaj.n) + ' would still have a majority.' : 'No party would have a majority.') + '</p></div></div>' +
			'<p class="tu-note">The same votes, shared out across ' + (D.id === 'ca2025' ? 'the whole country' : 'the whole province') + ' with this formula. Only a comparison: under another system parties would campaign and people might vote differently.' + (D.id === 'ca2025' ? ' The Bloc Québécois runs only in Quebec, so a nationwide count understates how its votes work regionally.' : '') + '</p></div>';
	}
	function coalCard(D, id) {
		var sel = st.coal[D.id] || {}, sum = 0, parts = D.parties.filter(function (p) { return p.s > 0; });
		parts.forEach(function (p) { if (sel[p.k]) sum += p.s; });
		var mins = E.coalitions(D.parties, D.majority);
		return '<div class="tu-card el-coal" id="' + id + '-co"><div class="el-chead"><h2>Who could make a majority? ' + q('coalition') + '</h2></div><p class="tu-note">Tap parties to add them together.</p>' +
			'<div class="el-coalchips">' + parts.map(function (p) { return '<button type="button" class="el-cchip" data-co="' + esc(p.k) + '" data-d="' + D.id + '" aria-pressed="' + (!!sel[p.k]) + '" style="--pc:' + p.col + '">' + sw(p.col) + esc(p.n) + ' <b>' + p.s + '</b></button>'; }).join('') + '<button type="button" class="tu-btn tu-btn--ghost el-co0" data-d="' + D.id + '">Clear</button></div>' +
			'<div class="el-rb el-rb--co" role="img" aria-label="' + sum + ' of ' + D.seats + ' seats">' + (function () { var x = 0; return parts.filter(function (p) { return sel[p.k]; }).map(function (p) { var w = p.s / D.seats * 100, s = '<i style="left:' + x + '%;width:' + w + '%;background:' + p.col + '"></i>'; x += w; return s; }).join(''); })() + '<b class="el-maj" style="left:' + (D.majority / D.seats * 100) + '%"><span>' + D.majority + '</span></b></div>' +
			'<div class="el-verdict">' + (sum ? '<b>' + sum + ' seats</b>: ' + (sum >= D.majority ? 'a majority (' + (sum - D.majority + 1) + ' to spare).' : (D.majority - sum) + ' short of a majority.') : 'Nothing chosen yet.') + '</div>' +
			'<p class="tu-note">Smallest groups that reach ' + D.majority + ': ' + (mins.length ? mins.map(function (m) { return esc(m.ks.map(function (k) { return D.parties.filter(function (p) { return p.k === k; })[0].n; }).join(' + ')) + ' (' + m.s + ')'; }).join('; ') : 'none') + '. Arithmetic only, not a prediction of any agreement.</p></div>';
	}
	root.addEventListener('click', function (e) {
		var b = e.target.closest('.el-prm button'); if (b) { st.pr = b.getAttribute('data-v'); save(); drawTab(st.tab); return; }
		b = e.target.closest('.el-thr0'); if (b) { st.thr = 0; save(); drawTab(st.tab); return; }
		b = e.target.closest('.el-cchip'); if (b) { var d = b.getAttribute('data-d'), k = b.getAttribute('data-co'); st.coal[d] = st.coal[d] || {}; st.coal[d][k] = !st.coal[d][k]; drawTab(st.tab); return; }
		b = e.target.closest('.el-co0'); if (b) { st.coal[b.getAttribute('data-d')] = {}; drawTab(st.tab); }
	});
	root.addEventListener('input', function (e) { if (e.target.classList && e.target.classList.contains('el-thr')) { st.thr = +e.target.value; save(); var y = window.scrollY; drawTab(st.tab); window.scrollTo(0, y); var t = root.querySelector('#el-p-' + st.tab + ' .el-thr'); if (t) t.focus(); } });
	segOn('el-casel', function (v) { st.ca = v; save(); drawCa(); });
	segOn('el-bcsel', function (v) { st.bc = v; save(); drawBc(); });
	function drawCa() {
		segSet('el-casel', st.ca);
		if (st.ca === 'now') {
			var c = src('commons'), base = E.CA2025;
			if (!c) { $('el-ca').innerHTML = '<div class="tu-card"><p>The House of Commons standings did not load right now. <a href="https://www.ourcommons.ca/members/en/party-standings" target="_blank" rel="noopener">See them on ourcommons.ca</a>.</p></div>'; return; }
			var ps = base.parties.filter(function (p) { return p.k !== 'PPC' && p.k !== 'OTH'; }).map(function (p) { var name = Object.keys(E.COMMONS_KEYS).filter(function (n) { return E.COMMONS_KEYS[n] === p.k; })[0]; return { k: p.k, n: p.n, col: p.col, s: c.by[name] || 0, v: 0, pc: 0 }; });
			if (c.by.Independent) ps.push({ k: 'IND', n: 'Independent', col: '#8a8f98', s: c.by.Independent, v: 0, pc: 0 });
			if (c.by.Vacant) ps.push({ k: 'VAC', n: 'Vacant', col: '#c4c9d0', s: c.by.Vacant, v: 0, pc: 0 });
			var known = {}; Object.keys(E.COMMONS_KEYS).forEach(function (n) { known[n] = 1; });
			Object.keys(c.by).forEach(function (n) { if (!known[n]) ps.push({ k: n, n: n, col: '#9aa3ad', s: c.by[n], v: 0, pc: 0 }); });
			var D = { id: 'canow', noVotes: 1, title: 'House of Commons today', seats: c.total, majority: Math.floor(c.total / 2) + 1, parties: ps, status: 'Live party standings from the House of Commons (members change party, resign or are elected in by-elections between general elections). A majority is counted out of all 343 seats.', sources: [['House of Commons: party standings', 'https://www.ourcommons.ca/members/en/party-standings'], ['Changes in membership', 'https://www.ourcommons.ca/members/en/party-standings/changes-in-membership']] };
			D.majority = 172;
			drawParl('el-ca', D, false);
			$('el-ca').insertAdjacentHTML('beforeend', coalCard(D, 'el-ca'));
			var diff = ps.map(function (p) { var b0 = base.parties.filter(function (x) { return x.k === p.k; })[0]; return b0 && b0.s !== p.s ? esc(p.n) + ' ' + (p.s - b0.s > 0 ? '+' : '') + (p.s - b0.s) : null; }).filter(Boolean);
			if (diff.length) $('el-ca-card').insertAdjacentHTML('beforeend', '<p class="tu-note">Since the 2025 election: ' + diff.join(', ') + '.</p>');
			return;
		}
		drawParl('el-ca', E.CA2025);
	}
	function bcLive() {
		var b = src('bcenr'), D = JSON.parse(JSON.stringify(E.BC2026)); if (!b || !b.parties || !b.parties.length) return D;
		var by = {}, oth = { s: 0, v: 0, pc: 0 };
		b.parties.forEach(function (p) { if (p.k) by[p.k] = p; else { oth.s += p.s; oth.v += p.v; oth.pc += p.pc; } });
		D.parties.forEach(function (p) { if (by[p.k]) { p.s = by[p.k].s; p.v = by[p.k].v; p.pc = by[p.k].pc; } else if (p.k === 'OTH') { p.s = oth.s; p.v = oth.v; p.pc = E.round(oth.pc, 2); } });
		D.parties.sort(function (a, c) { return c.s - a.s || c.v - a.v; });
		if (b.turnout) D.turnout = b.turnout; if (b.votes) D.votes = b.votes;
		var fin = b.final === 'Complete';
		D.prelim = !fin;
		D.status = (fin ? 'Final count complete' : 'Initial count' + (b.initial ? ' ' + b.initial.toLowerCase() : '') + '; final count ' + (b.final ? 'scheduled for ' + b.final : 'to come') + '. Mail-in and absentee ballots are counted at the final count.') + (b.asOf ? ' Elections BC, as of ' + b.asOf + '.' : '');
		return D;
	}
	function drawBc() {
		segSet('el-bcsel', st.bc);
		if (st.bc === 'bc2024') return drawParl('el-bc', E.BC2024);
		var D = bcLive();
		if (st.bc === 'bc2026') return drawParl('el-bc', D);
		// compare 2024 -> 2026
		var a = E.BC2024, keys = ['CON', 'NDP', 'GRN'], rows = keys.map(function (k) { var x = a.parties.filter(function (p) { return p.k === k; })[0], y = D.parties.filter(function (p) { return p.k === k; })[0]; return { n: y.n, col: y.col, s0: x.s, s1: y.s, v0: x.pc, v1: y.pc }; });
		var W = 600, H = 260, pad = 70, mx = 70, out = [];
		[0, 20, 40, 60].forEach(function (v) { var y = H - 30 - v / mx * (H - 60); out.push('<line class="el-grid" x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y + '" y2="' + y + '"></line><text class="el-ax" x="' + (pad - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '</text>'); });
		var my = H - 30 - 47 / mx * (H - 60); out.push('<line class="el-majl" x1="' + pad + '" x2="' + (W - pad) + '" y1="' + my + '" y2="' + my + '"></line><text class="el-ax" x="' + (W - pad + 6) + '" y="' + (my + 4) + '">47</text>');
		rows.forEach(function (r) { var y0 = H - 30 - r.s0 / mx * (H - 60), y1 = H - 30 - r.s1 / mx * (H - 60); out.push('<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y0 + '" y2="' + y1 + '" stroke="' + r.col + '" stroke-width="4"></line><circle cx="' + pad + '" cy="' + y0 + '" r="7" fill="' + r.col + '"></circle><circle cx="' + (W - pad) + '" cy="' + y1 + '" r="7" fill="' + r.col + '"></circle><text class="el-ax el-axb" x="' + (pad + 12) + '" y="' + (y0 - 9) + '">' + r.s0 + '</text><text class="el-ax el-axb" x="' + (W - pad - 12) + '" y="' + (y1 - 9) + '" text-anchor="end">' + r.s1 + '</text>'); });
		out.push('<text class="el-ax el-axb" x="' + pad + '" y="' + (H - 8) + '" text-anchor="middle">2024</text><text class="el-ax el-axb" x="' + (W - pad) + '" y="' + (H - 8) + '" text-anchor="middle">2026' + (D.prelim ? ' (initial)' : '') + '</text>');
		$('el-bc').innerHTML = '<div class="tu-card el-parl" id="el-bc-card"><div class="el-chead"><h2>British Columbia: 2024 to 2026</h2></div><div class="el-slope"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Seats in 2024 and 2026">' + out.join('') + '</svg></div>' +
			'<div class="el-ptab"><div class="el-ptr el-pth"><span>Party</span><span>Seats 2024 &rarr; 2026</span><span>Vote 2024 &rarr; 2026</span><span>Change</span></div>' + rows.map(function (r) { return '<div class="el-ptr"><span>' + sw(r.col) + esc(r.n) + '</span><span><b>' + r.s0 + ' &rarr; ' + r.s1 + '</b></span><span>' + E.fmt(r.v0, 2) + '% &rarr; ' + E.fmt(r.v1, 2) + '%</span><span>' + (r.s1 - r.s0 > 0 ? '+' : '') + (r.s1 - r.s0) + ' seats, ' + (r.v1 - r.v0 > 0 ? '+' : '') + E.fmt(r.v1 - r.v0, 1) + ' pts</span></div>'; }).join('') + '</div>' +
			'<p class="tu-note">' + esc(D.status) + ' 2024: final results. In 2024 BC United (formerly the BC Liberals) stepped aside before the vote; CentreBC and OneBC first ran in 2026.</p></div>';
		addPanels();
	}

	// ---------- calendar ----------
	segOn('el-calg', function (v) { st.calg = v; save(); drawCal(); });
	$('el-calfind').addEventListener('input', drawCal);
	function drawCal() {
		segSet('el-calg', st.calg); $('el-calchk').textContent = E.CHECKED;
		var now = Date.now(), f = String($('el-calfind').value || '').toLowerCase();
		var rows = E.upcoming(now, st.calg).filter(function (r) { return !f || (r[3] + ' ' + r[4]).toLowerCase().indexOf(f) >= 0; });
		var G = { ca: 'Canada', us: 'United States', world: 'World' };
		$('el-cal').innerHTML = rows.map(function (r) {
			var t = E.calTime(r[0]), d = Math.ceil((t - now) / 864e5), exact = /^\d{4}-\d\d-\d\d$/.test(r[0]) && !r[1];
			var when = d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 60 ? 'in ' + d + ' days' : d < 730 ? 'in ' + Math.round(d / 30.4) + ' months' : 'in ' + (d / 365.25).toFixed(1) + ' years';
			return '<div class="el-crow el-g-' + r[2] + '"><div class="el-cdate"><b>' + esc(dlong(r[0])) + '</b>' + (r[1] ? '<small>' + esc(r[1]) + '</small>' : '') + '<span class="el-cwhen' + (d <= 7 ? ' el-soon' : '') + '">' + (exact || d > 30 ? when : 'about ' + when) + '</span></div><div class="el-cwhat"><b>' + esc(r[3]) + '</b> <span class="el-gtag">' + G[r[2]] + '</span><span>' + esc(r[4]) + '</span><small>' + esc(r[5]) + ' · <a href="' + esc(r[6]) + '" target="_blank" rel="noopener">source</a></small></div></div>';
		}).join('') || '<p class="tu-note">Nothing matches.</p>';
		$('el-recent').innerHTML = E.RECENT.filter(function (r) { return (st.calg === 'all' || r[1] === st.calg) && (!f || (r[2] + ' ' + r[3]).toLowerCase().indexOf(f) >= 0); }).sort(function (a, b) { return a[0] < b[0] ? 1 : -1; }).map(function (r) {
			return '<div class="el-crow"><div class="el-cdate"><b>' + esc(dlong(r[0])) + '</b></div><div class="el-cwhat"><b>' + esc(r[2]) + '</b> <span class="el-gtag">' + G[r[1]] + '</span><span>' + esc(r[3]) + ': ' + esc(r[4]) + '</span><small><a href="' + esc(r[5]) + '" target="_blank" rel="noopener">source</a></small></div></div>';
		}).join('') || '<p class="tu-note">Nothing matches.</p>';
	}

	// ---------- panels (Fill window / Full screen) ----------
	function addPanels() {
		if (!window.MESPanel) return;
		[['el-build', '.el-chead'], ['el-ca-card', '.el-chead'], ['el-bc-card', '.el-chead'], ['el-ca-wi', '.el-chead'], ['el-bc-wi', '.el-chead']].forEach(function (x) { var s = $(x[0]); if (s) window.MESPanel.add(s, { bar: s.querySelector(x[1]) }); });
	}

	// ---------- footer ----------
	var SRCN = { races: 'Polymarket: every midterm race and the big-question markets', kalshiH: 'Kalshi: House control', kalshiS: 'Kalshi: Senate control', commons: 'House of Commons: party standings', bcenr: 'Elections BC: 2026 results' };
	function foot() {
		if (!data) { $('el-updated').textContent = ''; return; }
		var g = Date.parse(data.generated), ago = Math.max(0, Math.round((Date.now() - g) / 60000));
		$('el-updated').textContent = (MOCK ? 'Sample data saved ' : 'Updated ') + (ago < 1 ? 'just now' : ago < 120 ? ago + ' min ago' : new Date(g).toLocaleString());
		$('el-srcs').innerHTML = Object.keys(SRCN).map(function (k) { var s = data.sources[k]; return '<li><span class="el-dotok ' + (s && s.ok ? 'ok' : 'bad') + '"></span>' + esc(SRCN[k]) + (s && !s.ok ? ' <small>(' + esc(s.error) + ')</small>' : '') + '</li>'; }).join('');
	}

	function drawTab(t) {
		if (t === 'us') { usCards(); drawBuild(); drawOverview(); drawLinks(); drawCtx(); }
		else if (t === 'ca') drawCa();
		else if (t === 'bc') drawBc();
		else drawCal();
		addPanels();
	}
	function drawAll() { drawTab(st.tab); foot(); }
	window.addEventListener('resize', function () { /* SVGs scale with their viewBox */ });
	if (window.MESPanel) addPanels(); else document.addEventListener('DOMContentLoaded', addPanels);
	showTab(st.tab);
	load();
	setInterval(function () { if (!document.hidden && !MOCK) load(); }, 5 * 60 * 1000);
})();
