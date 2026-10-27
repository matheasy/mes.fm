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

/* MES NBA Picks: page script (lib.js = MESNBA is prepended by build_tool_apps.py).
   Standings: /api/nba-standings (edge-cached ESPN), else ESPN directly (CORS-open), else the committed sample (local previews, ?mock=1).
   State: localStorage mes-nba-picks:v1. Share links ?n=&e=&w= (no server). Leaderboard: /api/nba-picks. */
(function () {
	'use strict';
	var N = window.MESNBA, root = document.getElementById('np');
	if (!N || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-nba-picks:v1', ESPN_URL = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
	var qs = new URLSearchParams(location.search), LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname), MOCK = qs.get('mock') === '1';
	// the brother's East picks from the day this page was made (shown by "Fill in an example")
	var EXAMPLE = '1 76ers\n2 Celtics\n3 Knicks\n4 Raptors\n5 Cavaliers\n6 Pistons\n7 Pacers\n8 Hawks\n9 Heat\n10 Magic\n11 Hornets\n12 Wizards\n13 Bulls\n14 Bucks\n15 Nets';

	function az(c) { return N.CONF[c].slice().sort(function (a, b) { return N.TEAMS[a].full.localeCompare(N.TEAMS[b].full); }); }
	function uid() { return Math.random().toString(36).slice(2, 10); }
	function newSet(name) { return { id: uid(), name: name, E: az('E'), W: az('W') }; }
	var S = { sets: [], cur: '', cmp: '', conf: 'E', k: 'w3', ties: true, season: 0, lbB: 'E', lbM: 'w3', who: 'a' };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && Array.isArray(saved.sets)) S = Object.assign(S, saved); } catch (e) {}
	S.sets = S.sets.filter(function (s) { return s && N.validPicks(s.E, 'E') && N.validPicks(s.W, 'W'); });
	if (!S.sets.length) { var first = newSet('My picks'); S.sets.push(first); S.cur = first.id; }
	if (['E', 'W'].indexOf(S.conf) < 0) S.conf = 'E';
	if (['exact', 'w1', 'w2', 'w3', 'tier'].indexOf(S.k) < 0) S.k = 'w3';
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function setById(id) { for (var i = 0; i < S.sets.length; i++) if (S.sets[i].id === id) return S.sets[i]; return null; }
	function cur() { return setById(S.cur) || (S.cur = S.sets[0].id, S.sets[0]); }
	function cmp() { var c = setById(S.cmp); return c && c.id !== S.cur ? c : null; }
	function isAZ(list, c) { return list.join() === az(c).join(); }

	var ST = null, CUR_SEASON = 0;   // the standings shown, and the season that is "now"
	function toast(t) { var el = $('np-toast'); el.textContent = t; el.classList.add('tu-toast--show'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('tu-toast--show'); }, 2600); }
	function status(t, err) { var el = $('np-status'); el.hidden = !t; el.textContent = t || ''; el.classList.toggle('err', !!err); }
	function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
	function pct(x) { return Math.round(x * 100) + '%'; }
	function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
	function badge(id, small) {
		var t = N.TEAMS[id], b = el('span', 'np-badge' + (small ? ' np-badge--s' : ''), id);
		b.style.background = t.c1; b.style.color = N.textOn(t.c1); b.style.borderColor = t.c2;
		return b;
	}

	// ---------- standings ----------
	function getJson(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
	function wrapEspn(j) {
		var s = N.normEspn(j);
		if (!N.okStandings(s)) throw new Error('bad shape');
		return { source: 'ESPN', season: s.season, seasonName: s.seasonName || N.seasonLabel(s.season), generated: new Date().toISOString(), gp: { E: N.gamesPlayed(s.conf.E), W: N.gamesPlayed(s.conf.W) }, conf: s.conf };
	}
	function sample() { return getJson('/nba-picks/data/sample.json').then(function (j) { j.sample = true; return j; }); }
	function loadStandings(season) {
		var q = season ? '?season=' + season : '';
		var p;
		if (MOCK) p = sample();
		else p = (LOCAL ? Promise.reject(new Error('local')) : getJson('/api/nba-standings' + q).then(function (j) { if (!N.okStandings(j)) throw new Error('bad'); return j; }))
			.catch(function () { return getJson(ESPN_URL + q).then(wrapEspn); })
			.catch(function (e) { if (season && season !== CUR_SEASON) throw e; return sample(); });
		return p;
	}
	function showStandings(season) {
		status('Loading the standings…');
		return loadStandings(season).then(function (st) {
			ST = st; status('');
			if (!CUR_SEASON || !season) CUR_SEASON = st.season;
			S.season = st.season === CUR_SEASON ? 0 : st.season;
			fillSeasons(); render();
			if (st.sample) status('Showing a saved copy of the standings (' + new Date(st.generated).toLocaleString() + '): the live ones could not be loaded here.');
		}).catch(function () { status('Could not load those standings. Check your connection and press Refresh.', true); });
	}
	function fillSeasons() {
		var sel = $('np-season'); sel.innerHTML = '';
		for (var y = CUR_SEASON; y > CUR_SEASON - 4; y--) {
			var o = el('option', null, N.seasonLabel(y) + (y === CUR_SEASON ? ' (now)' : ' (final)')); o.value = y === CUR_SEASON ? '0' : String(y); sel.appendChild(o);
		}
		sel.value = String(S.season || 0);
		var gp = ST.gp ? ST.gp[S.conf] : 0, t = new Date(ST.generated);
		$('np-upd').textContent = (gp ? 'about ' + Math.round(gp) + ' games played' : 'no games played yet') + ' · ' + t.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	// ---------- scoring helpers ----------
	function score(set, c) { return ST && set ? N.scoreConf(set[c], ST.conf[c], { ties: S.ties }) : null; }
	function fmtMetric(m, k) {
		if (k === 'pts') return m.pts + ' / ' + 3 * m.n;
		if (k === 'close') return pct(m.close);
		if (k === 'rho') return (m.rho >= 0 ? '' : '−') + Math.abs(m.rho).toFixed(2);
		if (k === 'dist') return m.dist + ' (' + (m.dist / m.n).toFixed(1) + ' a team)';
		return m[k] + ' / ' + m.n;
	}
	var K_LABEL = { exact: 'in the exact spot', w1: 'within 1 spot', w2: 'within 2 spots', w3: 'within 3 spots', tier: 'in the right tier' };
	function posLabel(t) { return t.lo === t.hi ? ord(t.pos) : S.ties ? 'T' + t.lo + '\u2013' + t.hi : ord(t.pos); }

	// ---------- render ----------
	function render() {
		var set = cur(), c = S.conf, cname = c === 'E' ? 'East' : 'West';
		Array.prototype.forEach.call($('np-tabs').children, function (b) { b.setAttribute('aria-selected', String(b.dataset.conf === c)); });
		var ss = $('np-set'); ss.innerHTML = '';
		S.sets.forEach(function (s) { var o = el('option', null, s.name); o.value = s.id; ss.appendChild(o); });
		ss.value = set.id;
		var cs = $('np-cmp'); cs.innerHTML = ''; var o0 = el('option', null, 'nobody'); o0.value = ''; cs.appendChild(o0);
		S.sets.forEach(function (s) { if (s.id !== set.id) { var o = el('option', null, s.name); o.value = s.id; cs.appendChild(o); } });
		cs.value = cmp() ? S.cmp : '';
		$('np-del').disabled = S.sets.length < 2;
		$('np-edit-title').textContent = set.name + ': ' + cname + ' picks';
		$('np-score-title').textContent = 'How these ' + cname + ' picks are doing';
		Array.prototype.forEach.call($('np-k').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.k === S.k)); });
		$('np-ties').checked = S.ties;
		if (ST) fillSeasons();
		renderList(); renderScore(); renderViz(); renderCompare(); renderShare(); renderPost();
		save();
	}

	function renderList() {
		var set = cur(), c = S.conf, list = $('np-list'), sc = score(set, c), byId = {};
		if (sc) sc.teams.forEach(function (t) { byId[t.id] = t; });
		list.innerHTML = '';
		set[c].forEach(function (id, i) {
			var t = N.TEAMS[id], li = el('li', 'np-row'); li.dataset.id = id;
			var g = el('button', 'np-grip'); g.type = 'button'; g.setAttribute('aria-label', 'Move ' + t.full + ', now picked ' + ord(i + 1)); g.innerHTML = '<span aria-hidden="true">⠇⠇</span>';
			li.appendChild(el('span', 'np-rank', String(i + 1)));
			li.appendChild(g); li.appendChild(badge(id));
			var nm = el('span', 'np-tname'); nm.appendChild(el('b', null, t.name)); nm.appendChild(el('small', null, ' ' + (id === 'LAC' ? 'LA' : t.city)));
			li.appendChild(nm);
			var s = byId[id];
			if (s) {
				var chip = el('span', 'np-now', posLabel(s)); chip.style.borderColor = N.distColor(s.d);
				chip.title = 'Now ' + posLabel(s) + ' (' + s.row.w + '-' + s.row.l + '): ' + (s.d ? s.d + ' spot' + (s.d > 1 ? 's' : '') + ' off' : 'right spot');
				var dot = el('i', 'np-dot'); dot.style.background = N.distColor(s.d); chip.insertBefore(dot, chip.firstChild);
				li.appendChild(chip);
			}
			var up = el('button', 'np-mv', '▲'), dn = el('button', 'np-mv', '▼');
			up.type = dn.type = 'button'; up.dataset.mv = '-1'; dn.dataset.mv = '1';
			up.setAttribute('aria-label', 'Move ' + t.name + ' up'); dn.setAttribute('aria-label', 'Move ' + t.name + ' down');
			up.disabled = i === 0; dn.disabled = i === 14;
			li.appendChild(up); li.appendChild(dn);
			list.appendChild(li);
		});
		$('np-hint').textContent = isAZ(set[c], c) ? 'These are in A-Z order: drag each team (by its handle, or with the arrows) to where you think it will finish, or paste a list. On a keyboard, focus a handle and use Up / Down, Home / End.'
			: 'Drag a team by its handle (or use the arrows) to change your pick. The chip on the right is where the team is now, coloured by how far off you are.';
	}

	function renderScore() {
		var set = cur(), c = S.conf, sc = score(set, c), hero = $('np-hero'), box = $('np-metrics');
		hero.innerHTML = ''; box.innerHTML = '';
		if (!sc) { hero.textContent = 'Loading…'; return; }
		var m = sc.m, v = m[S.k];
		var big = el('div', 'np-big'); big.appendChild(el('b', null, String(v))); big.appendChild(el('span', null, '/ ' + m.n));
		hero.appendChild(big);
		var side = el('div', 'np-heros');
		side.appendChild(el('div', 'np-herol', 'teams ' + K_LABEL[S.k]));
		side.appendChild(el('div', 'np-herop', pct(v / m.n) + ' accuracy'));
		var bar = el('div', 'np-bar'), fill = el('i'); fill.style.width = (v / m.n * 100) + '%'; bar.appendChild(fill); side.appendChild(bar);
		hero.appendChild(side);
		var tbl = el('table', 'np-mt');
		N.METRICS.forEach(function (d) {
			var tr = el('tr'); if (d.k === S.k) tr.className = 'on';
			tr.appendChild(el('th', null, d.label));
			tr.appendChild(el('td', 'np-mv2', fmtMetric(m, d.k)));
			var td = el('td', 'np-mb'), b = el('span', 'np-bar np-bar--s'), f = el('i'); f.style.width = (N.metricShare(m, d.k) * 100) + '%'; b.appendChild(f); td.appendChild(b); tr.appendChild(td);
			tbl.appendChild(tr);
		});
		box.appendChild(tbl);
		var all = N.scoreAll(set, ST, { ties: S.ties });
		$('np-both').textContent = all.both && !isAZ(set.E, 'E') && !isAZ(set.W, 'W') ? 'Both conferences: ' + all.both.m[S.k] + ' / 30 ' + K_LABEL[S.k] + ' (' + pct(all.both.m[S.k] / 30) + '), ' + all.both.m.exact + ' exact, ' + all.both.m.pts + ' / 90 points.' : '';
	}

	// --- the picture: your order on the left, the standings on the right, a line per team coloured by how far off ---
	function vizSet() { var b = cmp(); return S.who === 'b' && b ? b : cur(); }
	function renderViz() {
		var box = $('np-viz'), set = vizSet(), c = S.conf, sc = score(set, c);
		var who = $('np-who'), b = cmp();
		who.hidden = !b;
		if (b) {
			who.innerHTML = '';
			[['a', cur().name], ['b', b.name]].forEach(function (x) { var bt = el('button', null, x[1]); bt.type = 'button'; bt.dataset.who = x[0]; bt.setAttribute('aria-pressed', String((S.who === 'b' ? 'b' : 'a') === x[0])); who.appendChild(bt); });
		}
		$('np-viz-title').textContent = set.name + '’s ' + (c === 'E' ? 'East' : 'West') + ' order vs the standings now';
		var lg = $('np-legend'); lg.innerHTML = '';
		[['right spot', 0], ['1 off', 1], ['2 off', 2], ['3 off', 3], ['4+ off', 4]].forEach(function (x) { var s = el('span'), i = el('i'); i.style.background = N.distColor(x[1]); s.appendChild(i); s.appendChild(document.createTextNode(x[0])); lg.appendChild(s); });
		if (!sc) { box.textContent = ''; return; }
		var fill = root.classList.contains('np-fillmode') || document.fullscreenElement === $('np-vizcard');
		var W = Math.max(300, box.clientWidth || 600), rowH = fill ? Math.max(26, Math.min(60, (window.innerHeight - 150) / 15.6)) : (W < 480 ? 30 : 34);
		var top = 28, H = top + rowH * 15 + 6, colW = Math.min(W * 0.36, 260), xL = 0, xR = W - colW, fs = Math.min(15, Math.max(11, rowH * 0.42));
		var showCity = colW > 170;
		var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'np-svg');
		svg.setAttribute('role', 'img');
		svg.setAttribute('aria-label', set.name + ': ' + sc.m[S.k] + ' of 15 ' + K_LABEL[S.k] + '. ' + sc.teams.map(function (t) { return N.TEAMS[t.id].name + ' picked ' + ord(t.pred) + ', now ' + posLabel(t); }).join('; '));
		var mk = function (tag, a, txt) { var e = document.createElementNS(ns, tag); for (var k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; };
		var y = function (p) { return top + (p - 1) * rowH; };
		// tier bands across the whole width
		N.TIERS.forEach(function (t, i) {
			mk('rect', { x: 0, y: y(t.from), width: W, height: rowH * (t.to - t.from + 1), class: 'np-band np-band' + i });
			mk('text', { x: W / 2, y: y(t.from) + 13, class: 'np-bandl', 'text-anchor': 'middle' }, (W - 2 * colW > 170 ? t.name + ' (' + t.from + '–' + t.to + ')' : t.name));
		});
		mk('text', { x: xL + 4, y: 18, class: 'np-colh' }, 'Picked');
		mk('text', { x: W - 4, y: 18, class: 'np-colh', 'text-anchor': 'end' }, 'Now');
		var lines = mk('g', { class: 'np-lines' });
		var rowsG = mk('g', {});
		var byPos = {};
		sc.teams.forEach(function (t) { byPos[t.pos] = t; });
		// tied groups on the right: a bracket mark
		if (S.ties) {
			for (var p = 1; p <= 15; p++) {
				var t = byPos[p]; if (!t || t.lo !== p || t.hi === t.lo) continue;
				var br = document.createElementNS(ns, 'path');
				br.setAttribute('d', 'M' + (xR - 5) + ' ' + (y(t.lo) + 5) + ' h-4 V' + (y(t.hi) + rowH - 5) + ' h4');
				br.setAttribute('class', 'np-tie'); rowsG.appendChild(br);
			}
		}
		function teamCell(t, x, right, p) {
			var g = document.createElementNS(ns, 'g'); g.setAttribute('class', 'np-cell'); g.dataset.id = t.id;
			var tm = N.TEAMS[t.id], cy = y(p) + rowH / 2, bw = fs * 3.2, bh = rowH - 8;
			var r = document.createElementNS(ns, 'rect');
			r.setAttribute('x', x); r.setAttribute('y', y(p) + 2); r.setAttribute('width', colW); r.setAttribute('height', rowH - 4); r.setAttribute('rx', 6); r.setAttribute('class', 'np-cellbg');
			g.appendChild(r);
			var num = document.createElementNS(ns, 'text');
			num.setAttribute('x', right ? x + colW - 6 : x + 6); num.setAttribute('y', cy + fs * 0.36); num.setAttribute('class', 'np-num'); num.setAttribute('text-anchor', right ? 'end' : 'start');
			num.textContent = right ? (S.ties && t.lo !== t.hi ? 'T' + t.lo : String(p)) : String(p); g.appendChild(num);
			var bx = right ? x + colW - 6 - fs * 1.9 - bw : x + 6 + fs * 1.6;
			var b = document.createElementNS(ns, 'rect');
			b.setAttribute('x', bx); b.setAttribute('y', cy - bh / 2); b.setAttribute('width', bw); b.setAttribute('height', bh); b.setAttribute('rx', 4);
			b.setAttribute('fill', tm.c1); b.setAttribute('stroke', tm.c2); b.setAttribute('stroke-width', 2); g.appendChild(b);
			var bt = document.createElementNS(ns, 'text');
			bt.setAttribute('x', bx + bw / 2); bt.setAttribute('y', cy + fs * 0.34); bt.setAttribute('text-anchor', 'middle'); bt.setAttribute('class', 'np-btxt'); bt.setAttribute('fill', N.textOn(tm.c1));
			bt.setAttribute('font-size', fs * 0.82); bt.textContent = t.id; g.appendChild(bt);
			var nm = document.createElementNS(ns, 'text'), label = tm.name + (right ? ' ' + t.row.w + '-' + t.row.l : '');
			if (!showCity && tm.name.length > 9 && !right) label = tm.name.replace('Trail ', '').replace('Timberwolves', 'Wolves');
			if (!showCity && right) label = t.row.w + '-' + t.row.l;
			nm.setAttribute('x', right ? bx - 6 : bx + bw + 6); nm.setAttribute('y', cy + fs * 0.34); nm.setAttribute('class', 'np-tn'); nm.setAttribute('text-anchor', right ? 'end' : 'start');
			nm.setAttribute('font-size', fs); nm.textContent = label; g.appendChild(nm);
			rowsG.appendChild(g);
		}
		sc.teams.forEach(function (t) {
			teamCell(t, xL, false, t.pred);
			teamCell(t, xR, true, t.pos);
			var x1 = xL + colW, x2 = xR, y1 = y(t.pred) + rowH / 2, y2 = y(t.pos) + rowH / 2, mx = (x1 + x2) / 2;
			var path = document.createElementNS(ns, 'path');
			path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2);
			path.setAttribute('stroke', N.distColor(t.d)); path.setAttribute('class', 'np-line'); path.dataset.id = t.id;
			path.setAttribute('stroke-width', t.d === 0 ? 4 : 3);
			lines.appendChild(path);
		});
		box.innerHTML = ''; box.appendChild(svg);
		svg.addEventListener('pointerover', vizHover); svg.addEventListener('click', vizHover);
		svg.addEventListener('pointerleave', function () { vizFocus(null); });
		box._sc = sc;
	}
	function vizFocus(id) {
		var svg = $('np-viz').querySelector('svg'); if (!svg) return;
		svg.classList.toggle('np-hl', !!id);
		Array.prototype.forEach.call(svg.querySelectorAll('[data-id]'), function (e) { e.classList.toggle('on', e.dataset.id === id); });
		var info = $('np-vizinfo'), sc = $('np-viz')._sc;
		if (!id || !sc) { info.textContent = 'Tap or hover a team to follow its line.'; return; }
		var t = sc.teams.filter(function (x) { return x.id === id; })[0]; if (!t) return;
		info.textContent = N.TEAMS[id].full + ': picked ' + ord(t.pred) + ', now ' + posLabel(t) + ' at ' + t.row.w + '-' + t.row.l + (t.row.gb ? ', ' + t.row.gb + ' games back' : '') + '. ' +
			(t.d === 0 ? 'Right spot.' : t.d + ' spot' + (t.d > 1 ? 's' : '') + ' ' + (t.signed < 0 ? 'lower than you picked' : 'higher than you picked') + '.') + (t.tierOk ? ' Right tier.' : ' Different tier.');
	}
	function vizHover(e) { var g = e.target.closest && e.target.closest('[data-id]'); if (g) vizFocus(g.dataset.id); }

	function renderCompare() {
		var a = cur(), b = cmp(), box = $('np-compare');
		box.hidden = !b || !ST;
		if (!b || !ST) return;
		var c = S.conf, A = score(a, c), B = score(b, c), ct = $('np-ct'), tt = $('np-tt');
		$('np-cmp-title').textContent = 'Head to head (' + (c === 'E' ? 'East' : 'West') + '): ' + a.name + ' vs ' + b.name;
		ct.innerHTML = '';
		var h = el('tr'); h.appendChild(el('th', null, '')); h.appendChild(el('th', null, a.name)); h.appendChild(el('th', null, b.name)); ct.appendChild(h);
		var wa = 0, wb = 0;
		N.METRICS.forEach(function (d) {
			var va = N.metricValue(A.m, d.k), vb = N.metricValue(B.m, d.k), tr = el('tr');
			tr.appendChild(el('th', null, d.label));
			var ta = el('td', null, fmtMetric(A.m, d.k)), tb = el('td', null, fmtMetric(B.m, d.k));
			if (va > vb + 1e-9) { ta.className = 'np-win'; wa++; } else if (vb > va + 1e-9) { tb.className = 'np-win'; wb++; }
			tr.appendChild(ta); tr.appendChild(tb); ct.appendChild(tr);
		});
		var cap = el('caption', null, wa === wb ? 'Level: ' + wa + ' scores each.' : (wa > wb ? a.name : b.name) + ' leads on ' + Math.max(wa, wb) + ' of ' + N.METRICS.length + ' scores.');
		ct.insertBefore(cap, ct.firstChild);
		tt.innerHTML = '';
		var hh = el('tr'); ['Team', 'Now', a.name, b.name].forEach(function (x) { hh.appendChild(el('th', null, x)); }); tt.appendChild(hh);
		var bm = {}; B.teams.forEach(function (t) { bm[t.id] = t; });
		A.teams.slice().sort(function (x, y) { return x.pos - y.pos; }).forEach(function (t) {
			var tr = el('tr'), td = el('td'); td.appendChild(badge(t.id, true)); td.appendChild(document.createTextNode(' ' + N.TEAMS[t.id].name)); tr.appendChild(td);
			tr.appendChild(el('td', null, posLabel(t)));
			[t, bm[t.id]].forEach(function (x) { var c2 = el('td', null, ord(x.pred) + (x.d ? ' (' + x.d + ' off)' : ' ✓')); var dt = el('i', 'np-dot'); dt.style.background = N.distColor(x.d); c2.insertBefore(dt, c2.firstChild); c2.className = 'np-off'; tr.appendChild(c2); });
			tt.appendChild(tr);
		});
	}

	function shareUrl(set) {
		var u = new URL('/nba-picks', location.origin);
		u.searchParams.set('n', set.name); u.searchParams.set('e', N.encodeList(set.E)); u.searchParams.set('w', N.encodeList(set.W));
		return u.toString();
	}
	function renderShare() { $('np-link').value = shareUrl(cur()); }

	// ---------- editing ----------
	function move(id, delta, abs) {
		var set = cur(), a = set[S.conf], i = a.indexOf(id); if (i < 0) return;
		var j = abs != null ? abs : Math.max(0, Math.min(14, i + delta));
		if (j === i) return;
		a.splice(i, 1); a.splice(j, 0, id);
		render();
		var g = $('np-list').querySelector('[data-id="' + id + '"] .np-grip'); if (g) g.focus();
	}
	var list = $('np-list'), drag = null;
	list.addEventListener('click', function (e) {
		var b = e.target.closest('.np-mv'); if (!b) return;
		var id = b.closest('.np-row').dataset.id; move(id, +b.dataset.mv);
		var again = $('np-list').querySelector('[data-id="' + id + '"] [data-mv="' + b.dataset.mv + '"]'); if (again && !again.disabled) again.focus();
	});
	list.addEventListener('keydown', function (e) {
		var g = e.target.closest('.np-grip'); if (!g) return;
		var id = g.closest('.np-row').dataset.id, k = e.key;
		if (k === 'ArrowUp') move(id, -1); else if (k === 'ArrowDown') move(id, 1); else if (k === 'Home') move(id, 0, 0); else if (k === 'End') move(id, 0, 14); else return;
		e.preventDefault();
	});
	list.addEventListener('pointerdown', function (e) {
		var row = e.target.closest('.np-row'); if (!row || e.button) return;
		var grip = e.target.closest('.np-grip');
		if (!grip && (e.pointerType !== 'mouse' || e.target.closest('button'))) return;
		e.preventDefault();
		var r = row.getBoundingClientRect();
		drag = { row: row, id: row.dataset.id, y0: e.clientY, off: e.clientY - r.top, moved: false, pid: e.pointerId };
		try { list.setPointerCapture(e.pointerId); } catch (x) {}
	});
	function rowsTop() { var m = new Map(); Array.prototype.forEach.call(list.children, function (r) { m.set(r, r.getBoundingClientRect().top); }); return m; }
	list.addEventListener('pointermove', function (e) {
		if (!drag || e.pointerId !== drag.pid) return;
		if (!drag.moved && Math.abs(e.clientY - drag.y0) < 5) return;
		if (!drag.moved) { drag.moved = true; drag.row.classList.add('np-dragging'); list.classList.add('np-isdrag'); }
		var row = drag.row, y = e.clientY, before = null;
		var rows = Array.prototype.filter.call(list.children, function (r) { return r !== row; });
		for (var i = 0; i < rows.length; i++) { var b = rows[i].getBoundingClientRect(); if (y < b.top + b.height / 2) { before = rows[i]; break; } }
		if ((before && row.nextSibling !== before) || (!before && list.lastChild !== row)) {
			var t0 = rowsTop();
			row.style.transform = '';
			list.insertBefore(row, before);
			// FLIP the rows that moved
			Array.prototype.forEach.call(list.children, function (r) {
				if (r === row) return;
				var d = t0.get(r) - r.getBoundingClientRect().top;
				if (d) { r.style.transition = 'none'; r.style.transform = 'translateY(' + d + 'px)'; r.getBoundingClientRect(); r.style.transition = ''; r.style.transform = ''; }
			});
			Array.prototype.forEach.call(list.children, function (r, k) { r.querySelector('.np-rank').textContent = String(k + 1); });
		}
		row.style.transform = '';
		var nat = row.getBoundingClientRect().top;
		row.style.transform = 'translateY(' + (y - drag.off - nat) + 'px)';
		if (y < 70) window.scrollBy(0, -12); else if (y > window.innerHeight - 70) window.scrollBy(0, 12);
	});
	function endDrag() {
		if (!drag) return;
		var d = drag; drag = null;
		list.classList.remove('np-isdrag');
		d.row.classList.remove('np-dragging'); d.row.style.transform = '';
		if (!d.moved) return;
		var order = Array.prototype.map.call(list.children, function (r) { return r.dataset.id; });
		if (N.validPicks(order, S.conf)) cur()[S.conf] = order;
		render();
		var g = $('np-list').querySelector('[data-id="' + d.id + '"] .np-grip'); if (g) g.focus({ preventScroll: true });
	}
	list.addEventListener('pointerup', endDrag); list.addEventListener('pointercancel', endDrag);
	list.addEventListener('lostpointercapture', endDrag);

	// paste a list
	function pasteOpen(on) { $('np-paste').hidden = !on; $('np-paste-open').setAttribute('aria-expanded', String(on)); if (on) $('np-paste-t').focus(); $('np-paste-msg').textContent = ''; }
	$('np-paste-open').onclick = function () { pasteOpen($('np-paste').hidden); };
	$('np-paste-x').onclick = function () { pasteOpen(false); };
	$('np-example').onclick = function () { if (S.conf !== 'E') { S.conf = 'E'; render(); } $('np-paste-t').value = EXAMPLE; $('np-paste-msg').textContent = 'An East example, as someone sent it to us. Press "Use this list".'; };
	$('np-paste-go').onclick = function () {
		var c = S.conf, r = N.parseList($('np-paste-t').value, c), msg = [];
		if (!r.ids.length) { $('np-paste-msg').textContent = 'No team names found in that text.'; return; }
		var other = r.other.map(function (id) { return N.TEAMS[id].name; });
		var full = N.completeList(r.ids, c, cur()[c]);
		cur()[c] = full;
		var got = r.ids.filter(function (id) { return N.TEAMS[id].conf === c; }).length;
		msg.push('Read ' + got + ' of 15 teams.');
		if (r.unknown.length) msg.push('Not recognised: ' + r.unknown.join(', ') + '.');
		if (r.dupes.length) msg.push('Listed twice (second one ignored): ' + r.dupes.map(function (id) { return N.TEAMS[id].name; }).join(', ') + '.');
		if (other.length) msg.push('Not in the ' + (c === 'E' ? 'East' : 'West') + ' (left out): ' + other.join(', ') + '.');
		if (got < 15) msg.push('The ' + (15 - got) + ' missing team' + (15 - got > 1 ? 's were' : ' was') + ' added at the end in your previous order: drag ' + (15 - got > 1 ? 'them' : 'it') + ' into place.');
		var fz = r.items.filter(function (x) { return x.fuzzy && x.id; }).map(function (x) { return '"' + x.text + '" = ' + N.TEAMS[x.id].name; });
		if (fz.length) msg.push('Guessed: ' + fz.join(', ') + '.');
		render();
		$('np-paste-msg').textContent = msg.join(' ');
		if (got === 15 && !r.unknown.length && !r.dupes.length) { pasteOpen(false); toast('Picks updated from your list'); }
	};
	$('np-fill').onclick = function () { if (!ST) return; cur()[S.conf] = ST.conf[S.conf].map(function (r) { return r.id; }); render(); toast('Copied the current standings: now change what you disagree with'); };
	$('np-az').onclick = function () { cur()[S.conf] = az(S.conf); render(); };

	// sets
	function uniqueName(n) { var base = N.cleanName(n) || 'Picks', name = base, i = 2; while (S.sets.some(function (s) { return s.name === name; })) name = base + ' ' + i++; return name; }
	$('np-set').onchange = function () { S.cur = this.value; if (S.cmp === S.cur) S.cmp = ''; S.who = 'a'; render(); };
	$('np-cmp').onchange = function () { S.cmp = this.value; S.who = 'a'; render(); };
	$('np-new').onclick = function () { var n = prompt('Name for the new set of picks (e.g. a person):', uniqueName('Picks')); if (n == null) return; var s = newSet(uniqueName(n)); S.sets.push(s); S.cur = s.id; render(); };
	$('np-rename').onclick = function () { var s = cur(), n = prompt('New name:', s.name); if (n == null || !N.cleanName(n)) return; s.name = N.cleanName(n) === s.name ? s.name : uniqueName(n); render(); };
	$('np-dup').onclick = function () { var s = cur(), c = { id: uid(), name: uniqueName(s.name + ' copy'), E: s.E.slice(), W: s.W.slice() }; S.sets.push(c); S.cur = c.id; render(); toast('Copied: change this one, the original stays as it was'); };
	$('np-del').onclick = function () {
		if (S.sets.length < 2) return;
		var s = cur(); if (!confirm('Delete "' + s.name + '"? This cannot be undone.' + (s.lb ? ' (It stays on the leaderboard unless you remove it there first.)' : ''))) return;
		S.sets = S.sets.filter(function (x) { return x.id !== s.id; }); S.cur = S.sets[0].id; if (S.cmp === s.id) S.cmp = ''; render();
	};
	$('np-tabs').onclick = function (e) { var b = e.target.closest('[data-conf]'); if (!b) return; S.conf = b.dataset.conf; render(); };
	$('np-tabs').onkeydown = function (e) { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; S.conf = S.conf === 'E' ? 'W' : 'E'; render(); $('np-tabs').querySelector('[data-conf="' + S.conf + '"]').focus(); };
	$('np-k').onclick = function (e) { var b = e.target.closest('[data-k]'); if (!b) return; S.k = b.dataset.k; render(); };
	$('np-ties').onchange = function () { S.ties = this.checked; render(); };
	$('np-ties-q').onclick = function () { var n = $('np-ties-note'); n.hidden = !n.hidden; this.setAttribute('aria-expanded', String(!n.hidden)); };
	$('np-who').onclick = function (e) { var b = e.target.closest('[data-who]'); if (!b) return; S.who = b.dataset.who; renderViz(); };
	$('np-season').onchange = function () { var y = +this.value; showStandings(y || null).then(renderLb); };
	$('np-refresh').onclick = function () { showStandings(S.season || null).then(renderLb); };
	$('np-copy').onclick = function () {
		var v = $('np-link').value;
		(navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Link copied'); }, function () { $('np-link').select(); document.execCommand('copy'); toast('Link copied'); });
	};

	// fill window / full screen for the picture
	var card = $('np-vizcard');
	function setFill(on) { root.classList.toggle('np-fillmode', on); document.documentElement.classList.toggle('np-noscroll', on); renderViz(); }
	$('np-fillwin').onclick = function () { setFill(!root.classList.contains('np-fillmode')); };
	$('np-fillx').onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); setFill(false); };
	$('np-fs').onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (card.requestFullscreen) card.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); };
	document.addEventListener('fullscreenchange', function () { root.classList.toggle('np-fsmode', document.fullscreenElement === card); setTimeout(renderViz, 50); });
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('np-fillmode')) setFill(false); });
	var rw = 0;
	if (window.ResizeObserver) new ResizeObserver(function () { var w = $('np-viz').clientWidth; if (Math.abs(w - rw) > 4) { rw = w; renderViz(); } }).observe($('np-viz'));
	window.addEventListener('resize', function () { if (root.classList.contains('np-fillmode') || document.fullscreenElement) renderViz(); });

	// ---------- leaderboard ----------
	var LB = { rows: null, err: '' };
	var mSel = $('np-lb-m');
	N.METRICS.forEach(function (d) { var o = el('option', null, 'Rank by: ' + d.label); o.value = d.k; mSel.appendChild(o); });
	function lbUrl() { return '/api/nba-picks?board=' + S.lbB + '&m=' + S.lbM; }
	function renderLb() {
		Array.prototype.forEach.call($('np-lb-board').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.b === S.lbB)); });
		mSel.value = S.lbM;
		$('np-lb-season').textContent = CUR_SEASON ? N.seasonLabel(CUR_SEASON) : '';
		var tbl = $('np-lbt'), more = $('np-lb-more'); tbl.innerHTML = ''; more.textContent = '';
		if (S.season) { more.textContent = 'The leaderboard is for the ' + N.seasonLabel(CUR_SEASON) + ' season: switch the standings back to "now" to see it.'; return; }
		if (LOCAL || MOCK) { more.textContent = 'The leaderboard works on mes.fm itself (this local preview has no server).'; return; }
		more.textContent = 'Loading the leaderboard…';
		getJson(lbUrl()).then(function (j) {
			more.textContent = '';
			LB.rows = j.rows || [];
			if (!LB.rows.length) { more.textContent = 'No picks posted yet for ' + (S.lbB === 'both' ? 'both conferences' : S.lbB === 'E' ? 'the East' : 'the West') + '. Be the first!'; return; }
			var mine = S.sets.map(function (s) { return s.lb && s.lb.id; }).filter(Boolean), d = N.metric(S.lbM);
			var h = el('tr'); ['#', 'Name', d.short, 'Accuracy', 'Exact', 'Picked', ''].forEach(function (x) { h.appendChild(el('th', null, x)); }); tbl.appendChild(h);
			LB.rows.forEach(function (r) {
				var tr = el('tr'); if (mine.indexOf(r.id) >= 0) tr.className = 'np-me';
				tr.appendChild(el('td', 'np-r', String(r.r)));
				var nm = el('td', null, r.n); if (mine.indexOf(r.id) >= 0) nm.appendChild(el('span', 'np-you', 'you')); tr.appendChild(nm);
				tr.appendChild(el('td', 'np-sv', fmtMetric(r.m, S.lbM)));
				tr.appendChild(el('td', null, pct(r.share)));
				tr.appendChild(el('td', null, r.m.exact + '/' + r.m.n));
				var gp = S.lbB === 'both' ? Math.max(r.gp.E || 0, r.gp.W || 0) : r.gp[S.lbB] || 0;
				var pk = el('td', 'np-pk', gp ? 'after ' + Math.round(gp) + ' game' + (Math.round(gp) === 1 ? '' : 's') : 'before tip-off'); if (gp) pk.classList.add('np-late');
				pk.title = new Date(r.t).toLocaleString(); tr.appendChild(pk);
				var td = el('td'), b = el('button', 'np-link', 'Compare'); b.type = 'button'; b.dataset.lb = r.id; td.appendChild(b); tr.appendChild(td);
				tbl.appendChild(tr);
			});
			if (j.total > LB.rows.length) more.textContent = 'Top ' + LB.rows.length + ' of ' + j.total + ' shown.';
		}).catch(function () { more.textContent = 'The leaderboard could not be loaded right now.'; });
	}
	$('np-lb-board').onclick = function (e) { var b = e.target.closest('[data-b]'); if (!b) return; S.lbB = b.dataset.b; save(); renderLb(); };
	mSel.onchange = function () { S.lbM = this.value; save(); renderLb(); };
	$('np-lbt').onclick = function (e) {
		var b = e.target.closest('[data-lb]'); if (!b || !LB.rows) return;
		var r = LB.rows.filter(function (x) { return x.id === b.dataset.lb; })[0]; if (!r) return;
		var ex = S.sets.filter(function (s) { return s.from === r.id || (s.lb && s.lb.id === r.id); })[0];
		var s = ex || { id: uid(), name: uniqueName(r.n + ' (board)'), E: az('E'), W: az('W'), from: r.id };
		if (r.E) s.E = N.decodeList(r.E, 'E') || s.E; if (r.W) s.W = N.decodeList(r.W, 'W') || s.W;
		if (!ex) S.sets.push(s);
		if (s.id === S.cur) { toast('That is the set you are looking at'); return; }
		S.cmp = s.id; if (S.lbB !== 'both') S.conf = S.lbB; render();
		$('np-compare').scrollIntoView({ behavior: 'smooth', block: 'start' });
		toast('Comparing with ' + r.n);
	};
	function renderPost() {
		var s = cur(), posted = s.lb && s.lb.season === CUR_SEASON;
		if (document.activeElement !== $('np-lb-name')) $('np-lb-name').value = s.lbName || s.name;
		$('np-lb-post').textContent = posted ? 'Update my entry' : 'Post these picks';
		$('np-lb-del').hidden = !posted;
		$('np-post').hidden = !!S.season || !!s.from;
	}
	function lbMsg(t, err) { var m = $('np-lb-msg'); m.textContent = t; m.classList.toggle('err', !!err); }
	function post(body) {
		return fetch('/api/nba-picks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
			.then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; }); });
	}
	$('np-lb-post').onclick = function () {
		if (LOCAL || MOCK) { lbMsg('Posting works on mes.fm itself (this local preview has no server).', true); return; }
		var s = cur(), name = N.cleanName($('np-lb-name').value), e = $('np-lb-e').checked, w = $('np-lb-w').checked;
		if (!name) { lbMsg('Type a name for the board.', true); return; }
		if (!e && !w) { lbMsg('Tick East, West or both.', true); return; }
		var warn = (e && isAZ(s.E, 'E')) || (w && isAZ(s.W, 'W'));
		if (warn && !confirm('One of these lists is still in A-Z order. Post it anyway?')) return;
		var posted = s.lb && s.lb.season === CUR_SEASON;
		var body = { a: posted ? 'update' : 'submit', name: name, E: e ? s.E : null, W: w ? s.W : null, season: CUR_SEASON };
		if (!posted) { if (!e) delete body.E; if (!w) delete body.W; } else { body.id = s.lb.id; body.key = s.lb.key; }
		lbMsg('Saving…');
		post(body).then(function (j) {
			if (!posted) s.lb = { id: j.id, key: j.key, season: CUR_SEASON };
			s.lbName = name; save(); renderPost();
			lbMsg(posted ? 'Your entry is updated.' : 'Posted! This browser keeps a private key so you can update or remove it later.');
			renderLb();
		}).catch(function (err) { lbMsg(err.message, true); });
	};
	$('np-lb-del').onclick = function () {
		var s = cur(); if (!s.lb || !confirm('Remove "' + (s.lbName || s.name) + '" from the leaderboard?')) return;
		post({ a: 'delete', id: s.lb.id, key: s.lb.key }).then(function () { delete s.lb; save(); renderPost(); lbMsg('Removed from the leaderboard.'); renderLb(); })
			.catch(function (err) { if (/not on this season/.test(err.message)) { delete s.lb; save(); renderPost(); } lbMsg(err.message, true); });
	};

	// ---------- share link in the address ----------
	(function fromLink() {
		var e = N.decodeList(qs.get('e'), 'E'), w = N.decodeList(qs.get('w'), 'W');
		if (!e && !w) return;
		var name = N.cleanName(qs.get('n')) || 'Shared picks';
		var same = S.sets.filter(function (s) { return (!e || s.E.join() === e.join()) && (!w || s.W.join() === w.join()); })[0];
		if (same) { S.cur = same.id; toast('These picks are already saved here as "' + same.name + '"'); }
		else {
			var s = newSet(uniqueName(name)); if (e) s.E = e; if (w) s.W = w; S.sets.push(s);
			var prev = S.cur; S.cur = s.id; if (prev && prev !== s.id) S.cmp = prev;
			toast('Loaded ' + s.name + '’s picks from the link');
		}
		if (!e && w) S.conf = 'W';
		try { history.replaceState(null, '', location.pathname + location.hash); } catch (x) {}
	})();

	render();
	showStandings(null).then(renderLb);
})();
