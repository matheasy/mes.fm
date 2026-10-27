/* MES NBA Picks: pure logic (teams, name parser, ESPN standings normaliser, scoring, share-link encoding).
   Runs in the browser (window.MESNBA) and in node (require), and is copied byte-for-byte to mes.fm/api/_nba-lib.js
   for the standings / leaderboard functions. Tests: node tool_apps_src/nba-picks-tests.js */
(function (root) {
	'use strict';
	// id, city, nickname, conference, primary colour, secondary colour, extra aliases. Colours are plain team colours for badges (no logos).
	var T = [
		['ATL', 'Atlanta', 'Hawks', 'E', '#e03a3e', '#c1d32f', 'atl hawks'],
		['BOS', 'Boston', 'Celtics', 'E', '#007a33', '#ba9653', 'celts cs'],
		['BKN', 'Brooklyn', 'Nets', 'E', '#111111', '#ffffff', 'bkn brk bk njn new jersey nets'],
		['CHA', 'Charlotte', 'Hornets', 'E', '#1d1160', '#00788c', 'cha cho bobcats buzz city'],
		['CHI', 'Chicago', 'Bulls', 'E', '#ce1141', '#111111', 'chi'],
		['CLE', 'Cleveland', 'Cavaliers', 'E', '#860038', '#fdbb30', 'cavs cle cavalier'],
		['DET', 'Detroit', 'Pistons', 'E', '#c8102e', '#1d42ba', 'det stones'],
		['IND', 'Indiana', 'Pacers', 'E', '#002d62', '#fdbb30', 'ind indy'],
		['MIA', 'Miami', 'Heat', 'E', '#98002e', '#f9a01b', 'mia'],
		['MIL', 'Milwaukee', 'Bucks', 'E', '#00471b', '#eee1c6', 'mil'],
		['NYK', 'New York', 'Knicks', 'E', '#006bb6', '#f58426', 'ny nyk knickerbockers nyc new york knicks'],
		['ORL', 'Orlando', 'Magic', 'E', '#0077c0', '#c4ced4', 'orl'],
		['PHI', 'Philadelphia', '76ers', 'E', '#006bb6', '#ed174c', 'sixers philly phi phl seventy sixers 76 sixers'],
		['TOR', 'Toronto', 'Raptors', 'E', '#ce1141', '#a1a1a4', 'raps tor the north'],
		['WAS', 'Washington', 'Wizards', 'E', '#002b5c', '#e31837', 'wsh was wiz wizzards dc bullets'],
		['DAL', 'Dallas', 'Mavericks', 'W', '#00538c', '#b8c4ca', 'mavs dal'],
		['DEN', 'Denver', 'Nuggets', 'W', '#0e2240', '#fec524', 'nugs den'],
		['GSW', 'Golden State', 'Warriors', 'W', '#1d428a', '#ffc72c', 'gs gsw dubs warriors golden state'],
		['HOU', 'Houston', 'Rockets', 'W', '#ce1141', '#c4ced4', 'hou'],
		['LAC', 'LA', 'Clippers', 'W', '#c8102e', '#1d428a', 'lac clips la clippers los angeles clippers'],
		['LAL', 'Los Angeles', 'Lakers', 'W', '#552583', '#fdb927', 'lal la lakers lakeshow'],
		['MEM', 'Memphis', 'Grizzlies', 'W', '#5d76a9', '#12173f', 'grizz mem griz'],
		['MIN', 'Minnesota', 'Timberwolves', 'W', '#0c2340', '#78be20', 'wolves twolves t wolves min minny'],
		['NOP', 'New Orleans', 'Pelicans', 'W', '#0c2340', '#c8102e', 'no nop nola pels pelicans'],
		['OKC', 'Oklahoma City', 'Thunder', 'W', '#007ac1', '#ef3b24', 'okc oklahoma'],
		['PHX', 'Phoenix', 'Suns', 'W', '#1d1160', '#e56020', 'phx phoenix'],
		['POR', 'Portland', 'Trail Blazers', 'W', '#e03a3e', '#111111', 'blazers por rip city trailblazers'],
		['SAC', 'Sacramento', 'Kings', 'W', '#5a2d81', '#63727a', 'sac sacto'],
		['SAS', 'San Antonio', 'Spurs', 'W', '#111111', '#c4ced4', 'sa sas'],
		['UTA', 'Utah', 'Jazz', 'W', '#002b5c', '#f9a01b', 'uta utah'],
	];
	var TEAMS = {}, ORDER = [], CONF = { E: [], W: [] };
	T.forEach(function (r) {
		TEAMS[r[0]] = { id: r[0], city: r[1], name: r[2], full: (r[0] === 'LAC' ? 'LA' : r[1]) + ' ' + r[2], conf: r[3], c1: r[4], c2: r[5] };
		ORDER.push(r[0]); CONF[r[3]].push(r[0]);
	});
	var CONF_NAME = { E: 'Eastern Conference', W: 'Western Conference' };
	// ESPN abbreviations that differ from ours
	var ESPN = { NY: 'NYK', GS: 'GSW', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', BRK: 'BKN', PHO: 'PHX', CHO: 'CHA' };
	// Tiers of an NBA conference: 1-6 straight into the playoffs, 7-10 the play-in tournament, 11-15 the draft lottery.
	var TIERS = [{ k: 'po', name: 'Playoffs', from: 1, to: 6 }, { k: 'pi', name: 'Play-in', from: 7, to: 10 }, { k: 'lo', name: 'Lottery', from: 11, to: 15 }];
	function tierOf(p) { return p <= 6 ? 0 : p <= 10 ? 1 : 2; }

	function norm(s) {
		return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
	}
	// alias table: normalised text -> [ids] (an alias shared by two teams, like "la" or "los angeles", is ambiguous)
	var ALIAS = {};
	function addAlias(a, id) { a = norm(a); if (!a) return; var k = a.replace(/ /g, ''); (ALIAS[k] = ALIAS[k] || []); if (ALIAS[k].indexOf(id) < 0) ALIAS[k].push(id); }
	T.forEach(function (r) {
		var id = r[0];
		addAlias(id, id); addAlias(r[1], id); addAlias(r[2], id); addAlias(r[1] + ' ' + r[2], id); addAlias(TEAMS[id].full, id);
		// aliases are space separated words, but a few are two words: register single words AND every adjacent pair
		var w = r[6].split(' ');
		w.forEach(function (x, i) { addAlias(x, id); if (i < w.length - 1) addAlias(x + ' ' + w[i + 1], id); if (i < w.length - 2) addAlias(x + ' ' + w[i + 1] + ' ' + w[i + 2], id); });
	});
	Object.keys(ESPN).forEach(function (k) { addAlias(k, ESPN[k]); });
	// words that only got in through the pair trick and mean nothing alone
	['the', 'new', 'city', 'los', 'angeles', 'state', 'golden', 'rip', 'jersey', 'seventy', 'buzz', 'north', 'york', 'dc'].forEach(function (k) {
		if (ALIAS[k] && !/^(dc)$/.test(k)) delete ALIAS[k];
	});
	ALIAS.dc = ['WAS']; ALIAS.la = ['LAC', 'LAL']; ALIAS.losangeles = ['LAC', 'LAL']; ALIAS.newyork = ['NYK']; ALIAS.goldenstate = ['GSW'];
	ALIAS['76'] = ['PHI'];

	function lev(a, b, max) {   // optimal string alignment distance (a swap of two letters = 1), early exit above max
		if (Math.abs(a.length - b.length) > max) return max + 1;
		var p2 = null, prev = [], cur, i, j;
		for (j = 0; j <= b.length; j++) prev[j] = j;
		for (i = 1; i <= a.length; i++) {
			cur = [i]; var best = i;
			for (j = 1; j <= b.length; j++) {
				var c = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
				if (p2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) c = Math.min(c, p2[j - 2] + 1);
				cur[j] = c; if (c < best) best = c;
			}
			if (best > max) return max + 1;
			p2 = prev; prev = cur;
		}
		return prev[b.length];
	}

	// One team name -> { id } | { amb: [ids] } | null. conf ('E' / 'W') settles ambiguous or fuzzy matches in favour of that conference.
	function parseTeam(text, conf) {
		var n = norm(text).replace(/^(the )/, '');
		if (!n) return null;
		var k = n.replace(/ /g, '');
		var hit = ALIAS[k];
		var pick = function (ids) {
			if (ids.length === 1) return { id: ids[0] };
			var inC = conf ? ids.filter(function (id) { return TEAMS[id].conf === conf; }) : ids;
			return inC.length === 1 ? { id: inC[0] } : { amb: ids.slice() };
		};
		if (hit) return pick(hit);
		// last word or first word on its own ("Philadelphia Seventy-Sixers", "Boston C's")
		var words = n.split(' ');
		if (words.length > 1) {
			var a = ALIAS[words[words.length - 1]] || ALIAS[words[0]];
			if (a && a.length === 1) return { id: a[0], fuzzy: true };
		}
		// typos: closest alias within 1 edit (short words) or 2 edits (6+ letters)
		var best = null, bestD = 9, tie = false, max = k.length >= 6 ? 2 : k.length >= 4 ? 1 : 0;
		if (!max) return null;
		Object.keys(ALIAS).forEach(function (a) {
			if (a.length < 3) return;
			var d = lev(k, a, max);
			if (d > max) return;
			var ids = ALIAS[a];
			if (conf && ids.every(function (id) { return TEAMS[id].conf !== conf; })) d += 0.5;
			if (d < bestD) { bestD = d; best = ids; tie = false; } else if (d === bestD && best && best.join() !== ids.join()) tie = true;
		});
		if (!best || tie) return null;
		var r = pick(best); r.fuzzy = true; return r;
	}

	// strip "1.", "#1", "1)", "1 -", "15:" numbering and trailing records like "(3-1)", "3-1", "60-22", "- 58 wins"
	function cleanLine(s) {
		return String(s).replace(/^\s*[-*•]\s*/, '').replace(/^\s*#?\d{1,2}\s*(?:[.):\]-]\s*|\s+)/, '')
			.replace(/\(.*?\)/g, ' ').replace(/\b\d{1,2}\s*[-–]\s*\d{1,2}\b/g, ' ').replace(/\s[-–:]\s.*$/, '').trim();
	}
	// A pasted list (numbered or not, one per line, or comma / semicolon / ">" separated) -> { ids, items:[{text, id, amb, fuzzy}], unknown, dupes, missing }
	function parseList(text, conf) {
		var raw = String(text || '').replace(/\r/g, '');
		var lines = raw.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
		if (lines.length === 1) {
			if (/[,;>|]/.test(lines[0])) lines = lines[0].split(/[,;>|]/);
			else {
				var toks = lines[0].split(/\s+/);
				if (toks.length > 2 && toks.every(function (t) { var r = parseTeam(cleanLine(t), conf); return r && r.id; })) lines = toks;
			}
		}
		var ids = [], items = [], unknown = [], dupes = [];
		lines.forEach(function (l) {
			var c = cleanLine(l);
			if (!c) return;
			var r = parseTeam(c, conf), it = { text: c };
			if (r && r.id) {
				it.id = r.id; it.fuzzy = !!r.fuzzy;
				if (ids.indexOf(r.id) >= 0) { dupes.push(r.id); it.dupe = true; } else ids.push(r.id);
			} else if (r && r.amb) { it.amb = r.amb; unknown.push(c); } else unknown.push(c);
			items.push(it);
		});
		var other = conf ? ids.filter(function (id) { return TEAMS[id].conf !== conf; }) : [];
		var missing = conf ? CONF[conf].filter(function (id) { return ids.indexOf(id) < 0; }) : [];
		return { ids: ids, items: items, unknown: unknown, dupes: dupes, other: other, missing: missing };
	}
	// a valid list for one conference = 15 distinct ids of that conference
	function validPicks(arr, conf) {
		if (!Array.isArray(arr) || arr.length !== 15) return false;
		var seen = {};
		for (var i = 0; i < 15; i++) {
			var t = TEAMS[arr[i]];
			if (!t || t.conf !== conf || seen[arr[i]]) return false;
			seen[arr[i]] = 1;
		}
		return true;
	}
	// a parsed list completed to 15 (missing teams appended in the given fallback order) and cut to the conference
	function completeList(ids, conf, fallback) {
		var out = ids.filter(function (id) { return TEAMS[id] && TEAMS[id].conf === conf; });
		(fallback || CONF[conf]).forEach(function (id) { if (out.indexOf(id) < 0 && TEAMS[id] && TEAMS[id].conf === conf) out.push(id); });
		return out.slice(0, 15);
	}

	// ---- standings ----
	function teamFromEspn(abbr) { abbr = String(abbr || '').toUpperCase(); return TEAMS[abbr] ? abbr : ESPN[abbr] || null; }
	function statMap(stats) { var m = {}; (stats || []).forEach(function (s) { m[s.name] = s.value; m[s.name + '$'] = s.displayValue; }); return m; }
	// ESPN /apis/v2/sports/basketball/nba/standings -> { season, seasonName, conf: { E: [row], W: [row] } }, rows in ESPN's order (its tie-breaks), row = {id, w, l, pct, gb, seed, streak, l10}
	function normEspn(j) {
		var out = { season: null, seasonName: '', seasonType: null, conf: { E: [], W: [] } };
		(j && j.children || []).forEach(function (c) {
			var key = /east/i.test(c.name || c.abbreviation || '') ? 'E' : /west/i.test(c.name || c.abbreviation || '') ? 'W' : null;
			if (!key) return;
			var st = c.standings || {};
			out.season = st.season || out.season; out.seasonName = st.seasonDisplayName || out.seasonName; out.seasonType = st.seasonType || out.seasonType;
			var rows = (st.entries || []).map(function (e) {
				var id = teamFromEspn(e.team && e.team.abbreviation), s = statMap(e.stats);
				if (!id) return null;
				var w = +s.wins || 0, l = +s.losses || 0;
				return { id: id, w: w, l: l, pct: w + l ? Math.round(w / (w + l) * 1000) / 1000 : 0, gb: +s.gamesBehind || 0, seed: +s.playoffSeed || 99,
					streak: s['streak$'] || '', l10: s['Last Ten Games$'] || '' };
			}).filter(Boolean);
			rows.sort(function (a, b) { return a.seed - b.seed || b.pct - a.pct; });
			out.conf[key] = rows;
		});
		return out;
	}
	function okStandings(s) { return !!(s && s.conf && s.conf.E && s.conf.W && s.conf.E.length === 15 && s.conf.W.length === 15); }
	function gamesPlayed(rows) { var g = 0; rows.forEach(function (r) { g += r.w + r.l; }); return rows.length ? g / rows.length : 0; }

	// Actual positions of one conference: pos = the published order (1..15); lo..hi = the spots a team shares with teams on the same record
	// (early in a season five teams at 2-1 are really tied for 4th-8th). shareTies false = the published order only.
	function positions(rows, shareTies) {
		var map = {}, noGames = rows.every(function (r) { return r.w + r.l === 0; });
		rows.forEach(function (r, i) {
			var p = i + 1, lo = p, hi = p;
			if (shareTies && !noGames) {    // teams with exactly the same record (2-1 and 2-1; not 0-3 and 0-4, which have the same win % but not the same games back)
				var same = [];
				rows.forEach(function (o, j) { if (o.w === r.w && o.l === r.l) same.push(j + 1); });
				lo = Math.min.apply(null, same); hi = Math.max.apply(null, same);
			}
			map[r.id] = { pos: p, lo: lo, hi: hi, mid: (lo + hi) / 2, row: r };
		});
		return map;
	}

	// Score one conference. picks = 15 ids (1st..15th), rows = standings rows. Returns { teams:[...], m:{...} }.
	// distance d = how many spots off (0 when the pick falls inside the spots a team shares with tied teams).
	var MAXD = 112;          // total distance of a 15-team list in exactly the wrong order
	function scoreConf(picks, rows, opt) {
		opt = opt || {};
		var share = opt.ties !== false, P = positions(rows, share), teams = [], m = { n: 0, exact: 0, w1: 0, w2: 0, w3: 0, tier: 0, top10: 0, top6: 0, dist: 0, pts: 0 };
		picks.forEach(function (id, i) {
			var a = P[id]; if (!a) return;
			var pred = i + 1, d = pred < a.lo ? a.lo - pred : pred > a.hi ? pred - a.hi : 0;
			var tierOk = false, t10 = false, t6 = false;
			for (var q = a.lo; q <= a.hi; q++) {
				if (tierOf(q) === tierOf(pred)) tierOk = true;
				if ((q <= 10) === (pred <= 10)) t10 = true;
				if ((q <= 6) === (pred <= 6)) t6 = true;
			}
			m.n++; m.dist += d;
			if (d === 0) m.exact++; if (d <= 1) m.w1++; if (d <= 2) m.w2++; if (d <= 3) m.w3++;
			if (tierOk) m.tier++; if (t10) m.top10++; if (t6) m.top6++;
			m.pts += d === 0 ? 3 : d === 1 ? 2 : d === 2 ? 1 : 0;
			teams.push({ id: id, pred: pred, pos: a.pos, lo: a.lo, hi: a.hi, d: d, signed: pred < a.lo ? -(a.lo - pred) : pred > a.hi ? pred - a.hi : 0, tierOk: tierOk, row: a.row });
		});
		// Spearman rho on (pick rank, actual mid rank) and pairs in the right order (pairs on the same win % left out)
		var n = teams.length;
		if (n > 2) {
			var mx = 0, my = 0; teams.forEach(function (t) { mx += t.pred; my += share ? P[t.id].mid : t.pos; }); mx /= n; my /= n;
			var sxy = 0, sxx = 0, syy = 0;
			teams.forEach(function (t) { var dx = t.pred - mx, dy = (share ? P[t.id].mid : t.pos) - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; });
			m.rho = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
			var good = 0, dec = 0;
			for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
				var A = teams[i], B = teams[j], ya = share ? P[A.id].mid : A.pos, yb = share ? P[B.id].mid : B.pos;
				if (ya === yb) continue;
				dec++; if ((A.pred < B.pred) === (ya < yb)) good++;
			}
			m.pairs = good; m.pairsOf = dec;
		} else { m.rho = 0; m.pairs = 0; m.pairsOf = 0; }
		m.close = n === 15 ? 1 - m.dist / MAXD : 0;
		return { teams: teams, m: m };
	}
	// both conferences: picks = {E:[...], W:[...]} (either may be missing)
	function scoreAll(picks, st, opt) {
		var out = {};
		['E', 'W'].forEach(function (c) { if (picks && validPicks(picks[c], c) && st && st.conf[c] && st.conf[c].length) out[c] = scoreConf(picks[c], st.conf[c], opt); });
		if (out.E && out.W) {
			var m = {}; ['n', 'exact', 'w1', 'w2', 'w3', 'tier', 'top10', 'top6', 'dist', 'pts', 'pairs', 'pairsOf'].forEach(function (k) { m[k] = out.E.m[k] + out.W.m[k]; });
			m.rho = (out.E.m.rho + out.W.m.rho) / 2; m.close = 1 - m.dist / (2 * MAXD);
			out.both = { m: m };
		}
		return out;
	}
	// the metrics, in the order the page shows them. max(m) = the best possible value; fmt via fmt(); hi = higher is better
	var METRICS = [
		{ k: 'w3', label: 'Within 3 spots', short: '±3', of: 'n' },
		{ k: 'w2', label: 'Within 2 spots', short: '±2', of: 'n' },
		{ k: 'w1', label: 'Within 1 spot', short: '±1', of: 'n' },
		{ k: 'exact', label: 'Exact spot', short: 'Exact', of: 'n' },
		{ k: 'tier', label: 'Right tier (playoffs / play-in / lottery)', short: 'Tier', of: 'n' },
		{ k: 'top10', label: 'In or out of the top 10', short: 'Top 10', of: 'n' },
		{ k: 'pts', label: 'Points (3 exact, 2 within 1, 1 within 2)', short: 'Points', of: 'pts' },
		{ k: 'close', label: 'Closeness (100% = perfect order)', short: 'Close', of: 'pct' },
		{ k: 'rho', label: 'Rank correlation (Spearman ρ)', short: 'ρ', of: 'rho' },
		{ k: 'dist', label: 'Spots off in total (lower is better)', short: 'Off', of: 'dist', low: true },
	];
	function metric(k) { for (var i = 0; i < METRICS.length; i++) if (METRICS[i].k === k) return METRICS[i]; return null; }
	// a number to sort by (higher = better) and its share of the best possible (0..1)
	function metricValue(m, k) { return k === 'dist' ? -m.dist : m[k]; }
	function metricShare(m, k) {
		if (!m || !m.n) return 0;
		if (k === 'pts') return m.pts / (3 * m.n);
		if (k === 'close') return m.close;
		if (k === 'rho') return (m.rho + 1) / 2;
		if (k === 'dist') return m.close;
		return m[k] / m.n;
	}

	// ---- share links: ?n=Name&e=phi.bos.nyk...&w=okc.den... (lowercase ids joined by dots) ----
	function encodeList(ids) { return ids.map(function (x) { return x.toLowerCase(); }).join('.'); }
	function decodeList(s, conf) {
		var a = String(s || '').toUpperCase().split(/[.,\s-]+/).filter(Boolean);
		return validPicks(a, conf) ? a : null;
	}
	function cleanName(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); }

	// colour of a line by how many spots off it is
	var DCOL = ['#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626'];
	function distColor(d) { return DCOL[Math.min(4, d)]; }
	function textOn(hex) {
		var h = hex.replace('#', ''), r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
		var L = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
		var lum = 0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(b);
		return lum > 0.4 ? '#111111' : '#ffffff';
	}
	function seasonLabel(year) { year = +year; return year ? (year - 1) + '-' + String(year).slice(2) : ''; }

	var api = { TEAMS: TEAMS, ORDER: ORDER, CONF: CONF, CONF_NAME: CONF_NAME, ESPN: ESPN, TIERS: TIERS, tierOf: tierOf, METRICS: METRICS, MAXD: MAXD,
		norm: norm, lev: lev, parseTeam: parseTeam, cleanLine: cleanLine, parseList: parseList, validPicks: validPicks, completeList: completeList,
		teamFromEspn: teamFromEspn, normEspn: normEspn, okStandings: okStandings, gamesPlayed: gamesPlayed, positions: positions,
		scoreConf: scoreConf, scoreAll: scoreAll, metric: metric, metricValue: metricValue, metricShare: metricShare,
		encodeList: encodeList, decodeList: decodeList, cleanName: cleanName, distColor: distColor, textOn: textOn, seasonLabel: seasonLabel, _alias: ALIAS };
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.MESNBA = api;
})(typeof window !== 'undefined' ? window : this);
