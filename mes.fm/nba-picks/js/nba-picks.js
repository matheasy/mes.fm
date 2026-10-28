/* MES Picks (NBA, NFL, MLB, NHL, La Liga, Premier League): pure logic. Leagues, team tables built from ESPN's standings, name parser,
   ESPN normalisers (standings + playoff scoreboards), scoring of predicted tables and playoff picks, share-link encoding.
   Runs in the browser (window.MESNBA, also window.MESPicks) and in node (require), and is copied byte-for-byte to mes.fm/api/_nba-lib.js
   for the standings / leaderboard functions. Tests: node tool_apps_src/nba-picks-tests.js */
(function (root) {
	'use strict';

	function norm(s) {
		return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
	}

	// ---------- NBA's fixed team table (kept from the first version: its ids are in saved picks, links and the leaderboard) ----------
	// id, city, nickname, conference, primary colour, secondary colour, extra aliases
	var NBA_T = [
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

	// ---------- leagues ----------
	// confs: the big groups (conference / league); divs: matched to ESPN's division names; tiers / cut per group type (conf, div, league);
	// rank: how the whole-league table is ordered (pct = win %, pts = NHL points, table = ESPN's own order); po: the playoffs (stages picked from 2 on).
	function T(name, from, to, k) { return { name: name, from: from, to: to, k: k }; }
	var LEAGUES = {
		nba: { id: 'nba', name: 'NBA', long: 'NBA', sport: 'basketball/nba', slug: 'nba-picks', games: 82, season: 'end', rank: 'pct', recType: 'wl',
			confs: [{ k: 'E', name: 'Eastern Conference', short: 'East', m: 'east' }, { k: 'W', name: 'Western Conference', short: 'West', m: 'west' }],
			divs: [{ k: 'AT', name: 'Atlantic', conf: 'E', m: 'atlantic' }, { k: 'CE', name: 'Central', conf: 'E', m: 'central' }, { k: 'SE', name: 'Southeast', conf: 'E', m: 'southeast' },
				{ k: 'NW', name: 'Northwest', conf: 'W', m: 'northwest' }, { k: 'PA', name: 'Pacific', conf: 'W', m: 'pacific' }, { k: 'SW', name: 'Southwest', conf: 'W', m: 'southwest' }],
			tiers: { conf: [T('Playoffs', 1, 6, 'po'), T('Play-in', 7, 10, 'pi'), T('Lottery', 11, 15, 'lo')], div: [T('Division leader', 1, 1), T('The rest', 2, 5)],
				league: [T('Top 10', 1, 10), T('Middle', 11, 20), T('Bottom 10', 21, 30)] },
			cut: { conf: [10, 'In or out of the top 10 (playoffs + play-in)'], div: [1, 'Division winner or not'], league: [16, 'In or out of the top 16'] },
			po: { teams: 16, months: function (y) { return [y + '04', y + '05', y + '06']; },
				stages: [{ k: 'r1', name: 'First round', re: /1st round/i, bo: 7 }, { k: 'r2', name: 'Conference semifinals', short: 'Semis', re: /semifinal/i, bo: 7, slots: 4 },
					{ k: 'cf', name: 'Conference finals', short: 'Conf. finals', re: /(east|west)(ern)? (conference )?finals?\b/i, bo: 7, slots: 2 },
					{ k: 'f', name: 'NBA Finals', short: 'Finals', re: /nba finals/i, bo: 7, slots: 1 }, { k: 'ch', name: 'NBA champion', short: 'Champion', champ: true, slots: 1 }] },
			blurb: 'the 30 NBA teams' },
		nfl: { id: 'nfl', name: 'NFL', long: 'NFL', sport: 'football/nfl', slug: 'nfl-picks', games: 17, season: 'single', rank: 'pct', recType: 'wlt',
			confs: [{ k: 'AFC', name: 'American Football Conference', short: 'AFC', m: 'afc|american' }, { k: 'NFC', name: 'National Football Conference', short: 'NFC', m: 'nfc|national' }],
			divs: ['East', 'North', 'South', 'West'].reduce(function (a, d) { ['AFC', 'NFC'].forEach(function (c) { a.push({ k: c + d[0], name: c + ' ' + d, conf: c, m: c.toLowerCase() + ' ' + d.toLowerCase() }); }); return a; }, [])
				.sort(function (a, b) { return a.conf < b.conf ? -1 : a.conf > b.conf ? 1 : 0; }),
			tiers: { conf: [T('Division winners', 1, 4, 'dw'), T('Wild cards', 5, 7, 'wc'), T('Out', 8, 16, 'out')], div: [T('Division winner', 1, 1), T('The rest', 2, 4)],
				league: [T('Top 8', 1, 8), T('9-16', 9, 16), T('17-24', 17, 24), T('Bottom 8', 25, 32)] },
			cut: { conf: [7, 'In or out of the playoffs (top 7 seeds)'], div: [1, 'Division winner or not'], league: [14, 'In or out of the top 14'] },
			po: { teams: 14, months: function (y) { return [(y + 1) + '01', (y + 1) + '02']; },
				stages: [{ k: 'wc', name: 'Wild Card round', re: /wild ?card/i, bo: 1 }, { k: 'dv', name: 'Divisional round', short: 'Divisional', re: /divisional/i, bo: 1, slots: 4 },
					{ k: 'cc', name: 'Conference championships', short: 'Conf. title games', re: /(afc|nfc) championship/i, bo: 1, slots: 2 },
					{ k: 'sb', name: 'Super Bowl', short: 'Super Bowl', re: /super bowl/i, bo: 1, slots: 1 }, { k: 'ch', name: 'Super Bowl champion', short: 'Champion', champ: true, slots: 1 }] },
			alias: { ARI: 'cards zona az arizona cardinals', ATL: 'falcs', BAL: 'bmore', CAR: 'panthers', CHI: 'da bears', CIN: 'cincy', DAL: 'boys americas team', GB: 'pack gbp green bay', IND: 'indy',
				JAX: 'jags jacksonville', KC: 'kansas city', LV: 'vegas lvr oak oakland', LAC: 'bolts', LAR: 'la rams', MIA: 'fins phins', MIN: 'vikes minny', NE: 'pats new england', NO: 'nola', NYG: 'big blue nyg',
				NYJ: 'gang green nyj', PHI: 'birds philly', PIT: 'pitt', SF: 'niners 49ers 9ers frisco', SEA: 'hawks', TB: 'bucs tampa', TEN: 'titans', WSH: 'was skins washington commies' },
			blurb: 'the 32 NFL teams' },
		mlb: { id: 'mlb', name: 'MLB', long: 'MLB', sport: 'baseball/mlb', slug: 'mlb-picks', games: 162, season: 'single', rank: 'pct', recType: 'wl',
			confs: [{ k: 'AL', name: 'American League', short: 'AL', m: 'american' }, { k: 'NL', name: 'National League', short: 'NL', m: 'national' }],
			divs: [{ k: 'ALE', name: 'AL East', conf: 'AL', m: 'american league east' }, { k: 'ALC', name: 'AL Central', conf: 'AL', m: 'american league central' }, { k: 'ALW', name: 'AL West', conf: 'AL', m: 'american league west' },
				{ k: 'NLE', name: 'NL East', conf: 'NL', m: 'national league east' }, { k: 'NLC', name: 'NL Central', conf: 'NL', m: 'national league central' }, { k: 'NLW', name: 'NL West', conf: 'NL', m: 'national league west' }],
			tiers: { conf: [T('Division winners', 1, 3, 'dw'), T('Wild cards', 4, 6, 'wc'), T('Out', 7, 15, 'out')], div: [T('Division winner', 1, 1), T('The rest', 2, 5)],
				league: [T('Top 10', 1, 10), T('Middle', 11, 20), T('Bottom 10', 21, 30)] },
			cut: { conf: [6, 'In or out of the playoffs (top 6)'], div: [1, 'Division winner or not'], league: [12, 'In or out of the top 12'] },
			po: { teams: 12, months: function (y) { return [y + '0928', y + '0929', y + '0930', y + '10', y + '11']; },
				stages: [{ k: 'wc', name: 'Wild Card Series', re: /\b(al|nl)wc\b|wild ?card/i, bo: 3 }, { k: 'ds', name: 'Division Series', short: 'Division Series', re: /\b(al|nl)ds\b|division series/i, bo: 5, slots: 4 },
					{ k: 'cs', name: 'Championship Series', short: 'LCS', re: /\b(al|nl)cs\b|championship series/i, bo: 7, slots: 2 },
					{ k: 'ws', name: 'World Series', short: 'World Series', re: /world series/i, bo: 7, slots: 1 }, { k: 'ch', name: 'World Series champion', short: 'Champion', champ: true, slots: 1 }] },
			alias: { ARI: 'dbacks d backs diamondbacks snakes az', ATH: 'as athletics oakland oak sacramento', BAL: 'os orioles', BOS: 'red sox bosox', CHC: 'cubs cubbies', CHW: 'white sox chisox cws',
				CLE: 'guards', COL: 'rox', HOU: 'stros', LAA: 'halos ana anaheim', LAD: 'dodgers', MIA: 'fish', MIL: 'crew brew crew', NYM: 'amazins', NYY: 'yanks bronx bombers', PHI: 'phils',
				PIT: 'bucs', SD: 'pads', SEA: 'ms', STL: 'cards', TB: 'rays', TOR: 'jays', WSH: 'nats was' },
			blurb: 'the 30 MLB teams' },
		nhl: { id: 'nhl', name: 'NHL', long: 'NHL', sport: 'hockey/nhl', slug: 'nhl-picks', games: 82, season: 'end', rank: 'pts', recType: 'nhl',
			confs: [{ k: 'E', name: 'Eastern Conference', short: 'East', m: 'east' }, { k: 'W', name: 'Western Conference', short: 'West', m: 'west' }],
			divs: [{ k: 'ATL', name: 'Atlantic', conf: 'E', m: 'atlantic' }, { k: 'MET', name: 'Metropolitan', conf: 'E', m: 'metropolitan' },
				{ k: 'CEN', name: 'Central', conf: 'W', m: 'central' }, { k: 'PAC', name: 'Pacific', conf: 'W', m: 'pacific' }],
			tiers: { conf: [T('Playoffs', 1, 8, 'po'), T('Out', 9, 16, 'out')], div: [T('Top 3', 1, 3), T('The rest', 4, 8)], league: [T('Top 8', 1, 8), T('9-16', 9, 16), T('17-24', 17, 24), T('Bottom 8', 25, 32)] },
			cut: { conf: [8, 'In or out of the playoffs (top 8)'], div: [3, 'In or out of the division top 3'], league: [16, 'In or out of the top 16'] },
			po: { teams: 16, months: function (y) { return [y + '04', y + '05', y + '06']; },
				stages: [{ k: 'r1', name: 'First round', re: /1st round/i, bo: 7 }, { k: 'r2', name: 'Second round', short: 'Round 2', re: /2nd round/i, bo: 7, slots: 4 },
					{ k: 'cf', name: 'Conference finals', short: 'Conf. finals', re: /(east|west)(ern)? (conference )?final\b/i, bo: 7, slots: 2 },
					{ k: 'f', name: 'Stanley Cup Final', short: 'Cup Final', re: /stanley cup final/i, bo: 7, slots: 1 }, { k: 'ch', name: 'Stanley Cup champion', short: 'Champion', champ: true, slots: 1 }] },
			alias: { ANA: 'ducks', BOS: 'bs', CAR: 'canes', CBJ: 'jackets blue jackets columbus', COL: 'avs', DET: 'wings red wings', EDM: 'oil', FLA: 'cats florida', LA: 'lak la kings', MTL: 'habs canadiens montreal',
				NJ: 'njd', NSH: 'preds', NYI: 'isles', NYR: 'blueshirts', OTT: 'sens', PIT: 'pens', SJ: 'sjs', TB: 'bolts tbl', TOR: 'leafs maple leafs', UTA: 'utah mammoth utah hockey club',
				VAN: 'nucks', VGK: 'knights golden knights vegas', WPG: 'winnipeg', WSH: 'caps' },
			blurb: 'the 32 NHL teams' },
		laliga: { id: 'laliga', name: 'La Liga', long: 'La Liga', sport: 'soccer/esp.1', slug: 'la-liga-picks', games: 38, season: 'start', rank: 'table', recType: 'soc',
			confs: null, divs: null,
			tiers: { league: [T('Champions League', 1, 4, 'ucl'), T('Europe', 5, 7, 'eu'), T('Mid-table', 8, 17, 'mid'), T('Relegation', 18, 20, 'rel')] },
			cut: { league: [4, 'In or out of the top 4 (Champions League)'] },
			alias: { BAR: 'barca fcb', ATM: 'atleti atletico', RMA: 'real madrid madrid rm los blancos', BET: 'betis', RSO: 'la real sociedad', SEV: 'sevilla fc', ALA: 'alaves', ATH: 'athletic bilbao bilbao',
				CEL: 'celta', VIL: 'yellow submarine', DEP: 'depor la coruna', OSA: 'osasuna', RAC: 'racing', RAY: 'rayo', GET: 'getafe', ESP: 'espanyol', VAL: 'valencia cf', MCF: 'malaga',
				GIR: 'girona', MLL: 'mallorca', LPA: 'las palmas', LEG: 'leganes', VLL: 'valladolid', OVI: 'oviedo' },
			blurb: 'the 20 La Liga clubs' },
		epl: { id: 'epl', name: 'Premier League', long: 'English Premier League', sport: 'soccer/eng.1', slug: 'premier-league-picks', games: 38, season: 'start', rank: 'table', recType: 'soc',
			confs: null, divs: null,
			tiers: { league: [T('Champions League', 1, 4, 'ucl'), T('Europe', 5, 7, 'eu'), T('Mid-table', 8, 17, 'mid'), T('Relegation', 18, 20, 'rel')] },
			cut: { league: [4, 'In or out of the top 4 (Champions League)'] },
			alias: { MNC: 'man city city mcfc', ARS: 'gunners', BHA: 'brighton seagulls', LIV: 'pool lfc', CHE: 'blues', BRE: 'bees', LEE: 'leeds', NEW: 'toon magpies', AVL: 'villa', HUL: 'hull',
				EVE: 'toffees', IPS: 'ipswich', BOU: 'cherries bournemouth', TOT: 'spurs', FUL: 'cottagers', MAN: 'man utd man united united mufc manu', CRY: 'palace', NFO: 'forest nottm forest', COV: 'coventry',
				SUN: 'black cats', WHU: 'west ham hammers', WOL: 'wolves', BUR: 'burnley clarets', LEI: 'leicester foxes', SOU: 'southampton' },
			blurb: 'the 20 Premier League clubs' },
	};
	var LEAGUE_ORDER = ['nba', 'nfl', 'mlb', 'nhl', 'laliga', 'epl'];
	function league(id) { return LEAGUES[id] || null; }

	// ---------- teams ----------
	// The NBA ids differ from ESPN's in a few places
	var NBA_ESPN = { NY: 'NYK', GS: 'GSW', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', BRK: 'BKN', PHO: 'PHX', CHO: 'CHA' };
	function hexOk(c) { c = String(c || '').replace(/^#+/, ''); return /^[0-9a-f]{6}$/i.test(c) ? '#' + c.toLowerCase() : null; }
	function logoOk(u) { u = String(u || ''); return /^https:\/\/a\.espncdn\.com\/[\w\/.-]+\.png$/.test(u) ? u : ''; }

	// Context for one league and season: teams, groups (which teams are in each table), alias index. st = normalised standings (or null for NBA).
	function makeCtx(lgId, st) {
		var lg = LEAGUES[lgId], teams = {}, groups = {}, meta = [];
		if (lgId === 'nba') {
			NBA_T.forEach(function (r) { teams[r[0]] = { id: r[0], city: r[1], name: r[2], full: r[1] + ' ' + r[2], short: r[2], conf: r[3], div: null, c1: r[4], c2: r[5], logo: '' }; });
		}
		((st && st.teams) || []).forEach(function (t) {
			var o = teams[t.id] || (teams[t.id] = { id: t.id });
			['city', 'name', 'full', 'short', 'conf', 'div'].forEach(function (k) { if (t[k] != null && (lgId !== 'nba' || k === 'div')) o[k] = t[k]; });
			if (lgId !== 'nba' || !o.c1) { o.c1 = hexOk(t.c1) || o.c1 || '#64748b'; o.c2 = hexOk(t.c2) || o.c2 || '#cbd5e1'; }
			o.logo = logoOk(t.logo) || o.logo || '';
		});
		var ids = Object.keys(teams).sort(function (a, b) { return teams[a].full.localeCompare(teams[b].full); });
		if (lg.confs) lg.confs.forEach(function (c) { groups[c.k] = ids.filter(function (id) { return teams[id].conf === c.k; }); meta.push({ k: c.k, type: 'conf', name: c.name, short: c.short }); });
		if (lg.divs) {
			var dmeta = [];
			lg.divs.forEach(function (d) { var g = ids.filter(function (id) { return teams[id].div === d.k; }); if (g.length) { groups[d.k] = g; dmeta.push({ k: d.k, type: 'div', name: d.name, short: d.name, conf: d.conf }); } });
			meta = meta.concat(dmeta);
		}
		groups.L = ids.slice();
		meta.push({ k: 'L', type: 'league', name: lg.confs ? 'Whole league' : lg.name + ' table', short: lg.confs ? 'League' : 'Table' });
		var ctx = { lg: lg, teams: teams, ids: ids, groups: groups, meta: meta, alias: {} };
		buildAlias(ctx);
		return ctx;
	}
	function groupMeta(ctx, k) { for (var i = 0; i < ctx.meta.length; i++) if (ctx.meta[i].k === k) return ctx.meta[i]; return null; }
	function divKeys(ctx) { return ctx.meta.filter(function (m) { return m.type === 'div'; }).map(function (m) { return m.k; }); }
	function confKeys(ctx) { return ctx.meta.filter(function (m) { return m.type === 'conf'; }).map(function (m) { return m.k; }); }
	// the tabs of the page: [{k, name, groups:[keys]}]
	function views(ctx) {
		var v = [], lg = ctx.lg;
		confKeys(ctx).forEach(function (k) { var m = groupMeta(ctx, k); v.push({ k: k, name: m.short, long: m.name, groups: [k] }); });
		v.push({ k: 'L', name: lg.confs ? 'Whole league' : 'Table', long: lg.confs ? 'Whole league (all ' + ctx.ids.length + ' teams)' : lg.long + ' table', groups: ['L'] });
		var dk = divKeys(ctx); if (dk.length) v.push({ k: 'D', name: 'Divisions', long: 'Divisions', groups: dk });
		if (lg.po) v.push({ k: 'P', name: 'Playoffs', long: 'Playoffs', groups: [], po: true });
		return v;
	}

	// alias table: normalised text without spaces -> [ids]
	function addAlias(A, a, id) { a = norm(a); if (!a) return; var k = a.replace(/ /g, ''); if (!k) return; (A[k] = A[k] || []); if (A[k].indexOf(id) < 0) A[k].push(id); }
	function addWords(A, str, id) {
		var w = norm(str).split(' ').filter(Boolean);
		w.forEach(function (x, i) { addAlias(A, x, id); if (i < w.length - 1) addAlias(A, x + ' ' + w[i + 1], id); if (i < w.length - 2) addAlias(A, x + ' ' + w[i + 1] + ' ' + w[i + 2], id); });
	}
	var STOP = ['the', 'new', 'city', 'los', 'angeles', 'state', 'golden', 'rip', 'jersey', 'seventy', 'buzz', 'north', 'york', 'real', 'fc', 'cf', 'club', 'de', 'united', 'man', 'san', 'st', 'la', 'red', 'white', 'blue', 'green', 'big', 'gang', 'yellow', 'black', 'brew', 'maple', 'americas', 'team', 'da', 'd', 'los blancos', 'sevilla fc', 'valencia cf', 'hockey', 'club'];
	function buildAlias(ctx) {
		var A = ctx.alias, lg = ctx.lg;
		if (lg.id === 'nba') {
			NBA_T.forEach(function (r) {
				var id = r[0];
				addAlias(A, id, id); addAlias(A, r[1], id); addAlias(A, r[2], id); addAlias(A, r[1] + ' ' + r[2], id);
				addWords(A, r[6], id);
			});
			Object.keys(NBA_ESPN).forEach(function (k) { addAlias(A, k, NBA_ESPN[k]); });
			['the', 'new', 'city', 'los', 'angeles', 'state', 'golden', 'rip', 'jersey', 'seventy', 'buzz', 'north', 'york'].forEach(function (k) { delete A[k]; });
			A.dc = ['WAS']; A.la = ['LAC', 'LAL']; A.losangeles = ['LAC', 'LAL']; A.newyork = ['NYK']; A.goldenstate = ['GSW']; A['76'] = ['PHI'];
			return;
		}
		var single = {};    // words that came only from multi-word extras: added as pairs, not alone
		ctx.ids.forEach(function (id) {
			var t = ctx.teams[id];
			addAlias(A, id, id); addAlias(A, t.full, id); addAlias(A, t.name, id); addAlias(A, t.short, id); if (t.city) addAlias(A, t.city, id);
			addAlias(A, (t.city || '') + ' ' + (t.name || ''), id);
			var ex = lg.alias && lg.alias[id];
			if (ex) addWords(A, ex, id);
			// a club's full name word by word ("Manchester City" -> "manchester", "city"): only distinctive words survive the STOP list
			norm(t.full).split(' ').forEach(function (w) { if (w.length > 2) addAlias(A, w, id); });
		});
		STOP.forEach(function (k) { delete A[norm(k).replace(/ /g, '')]; });
		ctx.ids.forEach(function (id) { addAlias(A, id, id); });   // an abbreviation always works (NHL "LA", EPL "MAN")
		// ambiguous words that are nicknames on purpose keep all their teams (e.g. "la" in the NFL); everything else is fine as it is
		if (lg.id === 'nfl') { A.la = ['LAC', 'LAR']; A.newyork = ['NYG', 'NYJ']; }
		if (lg.id === 'mlb') { A.la = ['LAA', 'LAD']; A.newyork = ['NYM', 'NYY']; A.chicago = ['CHC', 'CHW']; A.sox = ['BOS', 'CHW']; }
		if (lg.id === 'nhl') { A.newyork = ['NYI', 'NYR']; }
		if (lg.id === 'epl') { A.manchester = ['MAN', 'MNC']; }
		if (lg.id === 'laliga') { A.madrid = ['ATM', 'RMA']; A.real = ctx.ids.filter(function (id) { return /^real /i.test(ctx.teams[id].full); }); if (!A.real.length) delete A.real; }
		Object.keys(A).forEach(function (k) { A[k] = A[k].filter(function (id) { return ctx.teams[id]; }); if (!A[k].length) delete A[k]; });
	}

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

	// One team name -> { id } | { amb: [ids] } | null. within = the ids of the table being filled: settles ambiguous or fuzzy matches.
	function parseTeam(ctx, text, within) {
		var A = ctx.alias, n = norm(text).replace(/^(the )/, '');
		if (!n) return null;
		var k = n.replace(/ /g, ''), hit = A[k];
		var pick = function (ids) {
			if (ids.length === 1) return { id: ids[0] };
			var inG = within ? ids.filter(function (id) { return within.indexOf(id) >= 0; }) : ids;
			return inG.length === 1 ? { id: inG[0] } : { amb: ids.slice() };
		};
		if (hit) return pick(hit);
		var words = n.split(' ');
		if (words.length > 1) {
			var a = A[words[words.length - 1]] || A[words[0]];
			if (a && a.length === 1) return { id: a[0], fuzzy: true };
		}
		var best = null, bestD = 9, tie = false, max = k.length >= 6 ? 2 : k.length >= 4 ? 1 : 0;
		if (!max) return null;
		Object.keys(A).forEach(function (al) {
			if (al.length < 3) return;
			var d = lev(k, al, max);
			if (d > max) return;
			var ids = A[al];
			if (within && ids.every(function (id) { return within.indexOf(id) < 0; })) d += 0.5;
			if (d < bestD) { bestD = d; best = ids; tie = false; } else if (d === bestD && best && best.join() !== ids.join()) tie = true;
		});
		if (!best || tie) return null;
		var r = pick(best); r.fuzzy = true; return r;
	}

	// strip "1.", "#1", "1)", "1 -", "15:" numbering and trailing records like "(3-1)", "3-1", "60-22", "- 58 wins"
	function cleanLine(s) {
		return String(s).replace(/^\s*[-*•]\s*/, '').replace(/^\s*#?\d{1,2}\s*(?:[.):\]-]\s*|\s+)/, '')
			.replace(/\(.*?\)/g, ' ').replace(/\b\d{1,3}\s*[-–]\s*\d{1,3}(\s*[-–]\s*\d{1,3})?\b/g, ' ').replace(/\s[-–:]\s.*$/, '').trim();
	}
	// A pasted list -> { ids, items, unknown, dupes, other, missing } for one group's team list `within`
	function parseList(ctx, text, within) {
		var raw = String(text || '').replace(/\r/g, '');
		var lines = raw.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
		if (lines.length > 1) lines = lines.reduce(function (o, l) { return o.concat(/[,;|]/.test(l) ? l.split(/[,;|]/) : [l]); }, []);
		else if (lines.length === 1) {
			if (/[,;>|]/.test(lines[0])) lines = lines[0].split(/[,;>|]/);
			else {
				var toks = lines[0].split(/\s+/);
				if (toks.length > 2 && toks.every(function (t) { var r = parseTeam(ctx, cleanLine(t), within); return r && r.id; })) lines = toks;
			}
		}
		var ids = [], items = [], unknown = [], dupes = [];
		lines.forEach(function (l) {
			var c = cleanLine(l);
			if (!c) return;
			var r = parseTeam(ctx, c, within), it = { text: c };
			if (r && r.id) {
				it.id = r.id; it.fuzzy = !!r.fuzzy;
				if (ids.indexOf(r.id) >= 0) { dupes.push(r.id); it.dupe = true; } else ids.push(r.id);
			} else if (r && r.amb) { it.amb = r.amb; unknown.push(c); } else unknown.push(c);
			items.push(it);
		});
		var other = within ? ids.filter(function (id) { return within.indexOf(id) < 0; }) : [];
		var missing = within ? within.filter(function (id) { return ids.indexOf(id) < 0; }) : [];
		return { ids: ids, items: items, unknown: unknown, dupes: dupes, other: other, missing: missing };
	}
	// a valid list for a group = every team of the group once
	function validList(arr, within) {
		if (!Array.isArray(arr) || !within || arr.length !== within.length) return false;
		var seen = {};
		for (var i = 0; i < arr.length; i++) { if (within.indexOf(arr[i]) < 0 || seen[arr[i]]) return false; seen[arr[i]] = 1; }
		return true;
	}
	function completeList(ids, within, fallback) {
		var out = ids.filter(function (id) { return within.indexOf(id) >= 0; });
		(fallback || within).concat(within).forEach(function (id) { if (out.indexOf(id) < 0 && within.indexOf(id) >= 0) out.push(id); });
		return out.slice(0, within.length);
	}

	// ---------- ESPN standings ----------
	function statMap(stats) { var m = {}; (stats || []).forEach(function (s) { m[s.name] = s.value; m[s.name + '$'] = s.displayValue; }); return m; }
	function teamId(lgId, abbr) { abbr = String(abbr || '').toUpperCase(); if (lgId === 'nba') { var nt = NBA_T.some(function (r) { return r[0] === abbr; }); return nt ? abbr : NBA_ESPN[abbr] || null; } return /^[A-Z0-9]{1,5}$/.test(abbr) ? abbr : null; }
	function rowFrom(lgId, e) {
		var id = teamId(lgId, e.team && e.team.abbreviation), s = statMap(e.stats);
		if (!id) return null;
		var w = +s.wins || 0, l = +s.losses || 0, t = +s.ties || 0, otl = +s.otLosses || +s.overtimeLosses || 0;
		var gp = +s.gamesPlayed || (w + l + t + otl);
		var r = { id: id, w: w, l: l, gp: gp, seed: +s.playoffSeed || +s.rank || 99, gb: +s.gamesBehind || 0, streak: s['streak$'] || '', l10: s['Last Ten Games$'] || '' };
		if (t) r.t = t;
		if (otl) r.otl = otl;
		if (s.points != null && lgId !== 'nba' && lgId !== 'nfl' && lgId !== 'mlb') r.pts = +s.points || 0;
		if (s.pointDifferential != null && (lgId === 'laliga' || lgId === 'epl')) { r.gd = +s.pointDifferential || 0; r.gf = +s.pointsFor || 0; r.d = t; }
		var dec = w + l + t;
		r.pct = dec ? Math.round((w + t / 2) / dec * 1000) / 1000 : 0;
		return r;
	}
	function teamInfo(lgId, e) {
		var t = e.team || {}, id = teamId(lgId, t.abbreviation);
		if (!id) return null;
		var logo = (t.logos || [])[0];
		return { id: id, full: t.displayName || t.name || id, name: t.name || t.shortDisplayName || id, short: t.shortDisplayName || t.name || id, city: t.location || '', logo: logoOk(logo && logo.href) };
	}
	// jConf = /standings (conferences or the single table), jDiv = /standings?level=3 (divisions; optional), jTeams = /teams (colours; optional)
	// -> { lg, season, seasonName, seasonType, teams:[...], groups:{k:[rows]}, gp, over, started }
	function normEspn(lgId, jConf, jDiv, jTeams) {
		var lg = LEAGUES[lgId], out = { lg: lgId, season: null, seasonName: '', seasonType: null, teams: [], groups: {} };
		var info = {};
		function take(c, key, setConf) {
			var st = c.standings || {};
			out.season = st.season || out.season; out.seasonName = st.seasonDisplayName || out.seasonName; out.seasonType = st.seasonType || out.seasonType;
			var rows = (st.entries || []).map(function (e) { var r = rowFrom(lgId, e), ti = teamInfo(lgId, e); if (r && ti) { info[r.id] = Object.assign(info[r.id] || {}, ti); if (setConf) info[r.id].conf = setConf; } return r; }).filter(Boolean);
			return rows;
		}
		var kids = (jConf && jConf.children) || [];
		if (lg.confs) {
			kids.forEach(function (c) {
				var txt = norm((c.abbreviation || '') + ' ' + (c.name || ''));
				var cf = lg.confs.filter(function (x) { return new RegExp('\\b(' + x.m + ')').test(txt); })[0];
				if (!cf) return;
				var rows = take(c, cf.k, cf.k);
				rows.sort(function (a, b) { return a.seed - b.seed || b.pct - a.pct; });
				out.groups[cf.k] = rows;
			});
		} else if (kids[0]) {
			var rows = take(kids[0], 'L');
			rows.sort(function (a, b) { return a.seed - b.seed; });
			out.groups.L = rows;
		}
		// divisions: membership from level=3; order = the conference order (its tie-breaks), so a division table is the conference table filtered
		if (lg.divs && jDiv && jDiv.children) {
			jDiv.children.forEach(function (c) {
				(c.children || []).forEach(function (d) {
					var dn = norm(d.name || ''), dv = lg.divs.filter(function (x) { return dn.indexOf(x.m) === 0; })[0];
					if (!dv) return;
					((d.standings && d.standings.entries) || []).forEach(function (e) { var id = teamId(lgId, e.team && e.team.abbreviation); if (id && info[id]) info[id].div = dv.k; });
				});
			});
			lg.divs.forEach(function (dv) {
				var rows = [];
				lg.confs.forEach(function (cf) { (out.groups[cf.k] || []).forEach(function (r) { if (info[r.id] && info[r.id].div === dv.k) rows.push(r); }); });
				if (rows.length) out.groups[dv.k] = rows;
			});
		}
		if (lg.confs) {
			var all = [];
			lg.confs.forEach(function (cf) { all = all.concat(out.groups[cf.k] || []); });
			out.groups.L = leagueOrder(lg, all);
		}
		// colours
		var col = {};
		if (jTeams) {
			try { (jTeams.sports[0].leagues[0].teams || []).forEach(function (x) { var t = x.team || x, id = teamId(lgId, t.abbreviation); if (id) col[id] = { c1: hexOk(t.color), c2: hexOk(t.alternateColor) }; }); } catch (e) {}
		}
		out.teams = Object.keys(info).sort().map(function (id) {
			var t = info[id], c = col[id] || {};
			var o = { id: id, full: t.full, name: t.name, short: t.short, city: t.city, logo: t.logo };
			if (t.conf) o.conf = t.conf; if (t.div) o.div = t.div;
			if (c.c1) o.c1 = c.c1; if (c.c2) o.c2 = c.c2;
			return o;
		});
		var L = out.groups.L || [];
		out.gp = {}; Object.keys(out.groups).forEach(function (k) { out.gp[k] = Math.round(gamesPlayed(out.groups[k]) * 10) / 10; });
		out.started = L.some(function (r) { return r.gp > 0; });
		var gps = L.map(function (r) { return r.gp; });
		out.over = !!(L.length && Math.min.apply(null, gps) >= lg.games - 2 && gamesPlayed(L) >= lg.games - 1);
		return out;
	}
	// whole-league order: win % (ties count half), then wins; NHL: points, fewer games, wins; soccer: as published
	function leagueOrder(lg, rows) {
		var a = rows.slice();
		if (lg.rank === 'pts') a.sort(function (x, y) { return (y.pts || 0) - (x.pts || 0) || x.gp - y.gp || y.w - x.w; });
		else if (lg.rank === 'pct') a.sort(function (x, y) { return y.pct - x.pct || y.w - x.w || x.l - y.l; });
		return a;
	}
	function okStandings(st, lgId) {
		var lg = LEAGUES[lgId || (st && st.lg)];
		if (!lg || !st || !st.groups || !st.groups.L || st.groups.L.length < 16) return false;
		if (lg.confs) return lg.confs.every(function (c) { return st.groups[c.k] && st.groups[c.k].length >= 8; });
		return true;
	}
	function gamesPlayed(rows) { var g = 0; (rows || []).forEach(function (r) { g += r.gp != null ? r.gp : r.w + r.l; }); return rows && rows.length ? g / rows.length : 0; }
	// the "same record" key: rows with the same key share their spots
	function recKey(lg, r) {
		if (lg.recType === 'nhl') return (r.pts || 0) + '|' + r.gp;
		if (lg.recType === 'soc') return (r.pts || 0) + '|' + (r.gd || 0) + '|' + (r.gf || 0) + '|' + r.gp;
		return r.w + '|' + r.l + '|' + (r.t || 0);
	}
	function recText(lg, r) {
		if (!r) return '';
		if (lg.recType === 'nhl') return r.w + '-' + r.l + '-' + (r.otl || 0) + ', ' + (r.pts || 0) + ' pts';
		if (lg.recType === 'soc') return (r.pts || 0) + ' pts (' + r.w + '-' + (r.d || 0) + '-' + r.l + ')';
		return r.w + '-' + r.l + (r.t ? '-' + r.t : '');
	}
	function recShort(lg, r) {
		if (!r) return '';
		if (lg.recType === 'nhl' || lg.recType === 'soc') return (r.pts || 0) + ' pts';
		return r.w + '-' + r.l + (r.t ? '-' + r.t : '');
	}

	// positions: pos = published order; lo..hi = the spots a team shares with teams on the same record (shareTies false = published order only)
	function positions(rows, shareTies, lg) {
		lg = lg || LEAGUES.nba;
		var map = {}, noGames = rows.every(function (r) { return (r.gp != null ? r.gp : r.w + r.l) === 0; });
		rows.forEach(function (r, i) {
			var p = i + 1, lo = p, hi = p;
			if (shareTies && !noGames) {
				var k = recKey(lg, r), same = [];
				rows.forEach(function (o, j) { if (recKey(lg, o) === k) same.push(j + 1); });
				lo = Math.min.apply(null, same); hi = Math.max.apply(null, same);
			}
			map[r.id] = { pos: p, lo: lo, hi: hi, mid: (lo + hi) / 2, row: r };
		});
		return map;
	}
	function maxDist(n) { return Math.floor(n * n / 2); }
	function tiersFor(lg, type, n) {
		var t = (lg.tiers && lg.tiers[type]) || [T('All', 1, n)];
		return t.map(function (x) { return { name: x.name, from: x.from, to: Math.min(x.to, n), k: x.k }; }).filter(function (x) { return x.from <= n; });
	}
	function tierIndex(tiers, p) { for (var i = 0; i < tiers.length; i++) if (p >= tiers[i].from && p <= tiers[i].to) return i; return tiers.length - 1; }
	function cutFor(lg, type, n) { var c = lg.cut && lg.cut[type]; return c ? { n: Math.min(c[0], n - 1), label: c[1] } : { n: Math.floor(n / 2), label: 'Top half or bottom half' }; }

	// Score one table. picks = ids first..last, rows = standings rows of the same group, type = conf / div / league.
	function scoreGroup(picks, rows, opt) {
		opt = opt || {};
		var lg = opt.lg || LEAGUES.nba, type = opt.type || 'conf', n = rows.length;
		var share = opt.ties !== false, P = positions(rows, share, lg), tiers = tiersFor(lg, type, n), cut = cutFor(lg, type, n), teams = [];
		var m = { n: 0, exact: 0, w1: 0, w2: 0, w3: 0, tier: 0, cut: 0, dist: 0, pts: 0 };
		picks.forEach(function (id, i) {
			var a = P[id]; if (!a) return;
			var pred = i + 1, d = pred < a.lo ? a.lo - pred : pred > a.hi ? pred - a.hi : 0;
			var tierOk = false, cutOk = false;
			for (var q = a.lo; q <= a.hi; q++) {
				if (tierIndex(tiers, q) === tierIndex(tiers, pred)) tierOk = true;
				if ((q <= cut.n) === (pred <= cut.n)) cutOk = true;
			}
			m.n++; m.dist += d;
			if (d === 0) m.exact++; if (d <= 1) m.w1++; if (d <= 2) m.w2++; if (d <= 3) m.w3++;
			if (tierOk) m.tier++; if (cutOk) m.cut++;
			m.pts += d === 0 ? 3 : d === 1 ? 2 : d === 2 ? 1 : 0;
			teams.push({ id: id, pred: pred, pos: a.pos, lo: a.lo, hi: a.hi, d: d, signed: pred < a.lo ? -(a.lo - pred) : pred > a.hi ? pred - a.hi : 0, tierOk: tierOk, row: a.row });
		});
		var k = teams.length;
		m.sxy = 0; m.sxx = 0; m.syy = 0; m.pairs = 0; m.pairsOf = 0;
		if (k > 2) {
			var mx = 0, my = 0; teams.forEach(function (t) { mx += t.pred; my += share ? P[t.id].mid : t.pos; }); mx /= k; my /= k;
			teams.forEach(function (t) { var dx = t.pred - mx, dy = (share ? P[t.id].mid : t.pos) - my; m.sxy += dx * dy; m.sxx += dx * dx; m.syy += dy * dy; });
			for (var i = 0; i < k; i++) for (var j = i + 1; j < k; j++) {
				var A = teams[i], B = teams[j], ya = share ? P[A.id].mid : A.pos, yb = share ? P[B.id].mid : B.pos;
				if (ya === yb) continue;
				m.pairsOf++; if ((A.pred < B.pred) === (ya < yb)) m.pairs++;
			}
		}
		m.rho = m.sxx && m.syy ? m.sxy / Math.sqrt(m.sxx * m.syy) : 0;
		m.maxd = k === n ? maxDist(n) : 0;
		m.close = m.maxd ? 1 - m.dist / m.maxd : 0;
		return { teams: teams, m: m, tiers: tiers, cut: cut, n: n };
	}
	// several tables summed (divisions, all conferences): parts = [{m}]
	function sumMetrics(parts) {
		var m = { n: 0, exact: 0, w1: 0, w2: 0, w3: 0, tier: 0, cut: 0, dist: 0, pts: 0, pairs: 0, pairsOf: 0, maxd: 0 }, rho = 0;
		parts.forEach(function (p) { Object.keys(m).forEach(function (k) { m[k] += p.m[k] || 0; }); rho += p.m.rho; });
		m.rho = parts.length ? rho / parts.length : 0;
		m.close = m.maxd ? 1 - m.dist / m.maxd : 0;
		return m;
	}
	function groupType(ctx, k) { var g = groupMeta(ctx, k); return g ? g.type : 'conf'; }
	// lists = {groupKey: [ids]}; keys = the groups to score -> { parts:{k:score}, m } (m only when every key could be scored)
	function scoreLists(ctx, lists, st, keys, opt) {
		opt = opt || {};
		var parts = {}, got = [];
		keys.forEach(function (k) {
			var rows = st && st.groups && st.groups[k];
			if (!rows || !rows.length || !lists || !validList(lists[k], ctx.groups[k])) return;
			parts[k] = scoreGroup(lists[k], rows, { lg: ctx.lg, type: groupType(ctx, k), ties: opt.ties });
			got.push(parts[k]);
		});
		return { parts: parts, m: got.length === keys.length && got.length ? (got.length === 1 ? got[0].m : sumMetrics(got)) : null };
	}

	var METRICS = [
		{ k: 'w3', label: 'Within 3 spots', short: '±3' },
		{ k: 'w2', label: 'Within 2 spots', short: '±2' },
		{ k: 'w1', label: 'Within 1 spot', short: '±1' },
		{ k: 'exact', label: 'Exact spot', short: 'Exact' },
		{ k: 'tier', label: 'Right tier', short: 'Tier' },
		{ k: 'cut', label: 'Right side of the line', short: 'Cut' },
		{ k: 'pts', label: 'Points (3 exact, 2 within 1, 1 within 2)', short: 'Points' },
		{ k: 'close', label: 'Closeness (100% = perfect order)', short: 'Close' },
		{ k: 'rho', label: 'Rank correlation (Spearman ρ)', short: 'ρ' },
		{ k: 'dist', label: 'Spots off in total (lower is better)', short: 'Off', low: true },
	];
	function metric(k) { for (var i = 0; i < METRICS.length; i++) if (METRICS[i].k === k) return METRICS[i]; return null; }
	function metricValue(m, k) { return k === 'dist' ? -m.dist : m[k]; }
	function metricShare(m, k) {
		if (!m || !m.n) return 0;
		if (k === 'pts') return m.pts / (3 * m.n);
		if (k === 'close' || k === 'dist') return m.close;
		if (k === 'rho') return (m.rho + 1) / 2;
		return m[k] / m.n;
	}

	// ---------- playoffs ----------
	function poStages(lg) { return lg.po ? lg.po.stages.filter(function (s) { return s.slots; }) : []; }
	// the empty playoff picks: {stageKey: ['', '', ...]} (slots ordered conference by conference)
	function emptyPo(lg) { var o = {}; poStages(lg).forEach(function (s) { o[s.k] = []; var n = s.champ ? 1 : s.slots * (lg.confs ? lg.confs.length : 1); for (var i = 0; i < n; i++) o[s.k].push(''); }); return o; }
	function slotConf(lg, s, i) { if (s.champ || !lg.confs) return null; return lg.confs[Math.floor(i / s.slots)].k; }
	function stageWeight(lg, k) { var st = poStages(lg); for (var i = 0; i < st.length; i++) if (st[i].k === k) return Math.pow(2, i); return 0; }
	function poMax(lg) { var t = 0; poStages(lg).forEach(function (s) { var n = s.champ ? 1 : s.slots * (lg.confs ? lg.confs.length : 1); t += n * stageWeight(lg, s.k); }); return t; }
	// clean playoff picks: right lengths, known teams of the right conference, no team twice in a stage, later stages only from teams picked in the stage before
	function cleanPo(ctx, po) {
		var lg = ctx.lg, out = emptyPo(lg), st = poStages(lg);
		if (!po || typeof po !== 'object') return out;
		st.forEach(function (s, si) {
			var arr = Array.isArray(po[s.k]) ? po[s.k] : [], seen = {};
			out[s.k] = out[s.k].map(function (_, i) {
				var id = String(arr[i] || '').toUpperCase();
				if (!ctx.teams[id] || seen[id]) return '';
				var cf = slotConf(lg, s, i);
				if (cf && ctx.teams[id].conf !== cf) return '';
				if (si > 0 && out[st[si - 1].k].indexOf(id) < 0) return '';
				seen[id] = 1; return id;
			});
		});
		return out;
	}
	function poFilled(po) { var n = 0; Object.keys(po || {}).forEach(function (k) { (po[k] || []).forEach(function (x) { if (x) n++; }); }); return n; }
	// Results from ESPN scoreboards (several months merged): events with season.type 3 -> { started, done, champ, games, series:[...], reached:{stage:[ids]}, out:[ids] }
	function poResults(ctx, events) {
		var lg = ctx.lg, stages = lg.po.stages, ser = {}, list = [], games = 0;
		(events || []).forEach(function (e) {
			if (!e || !e.season || e.season.type !== 3) return;
			var c = (e.competitions || [])[0]; if (!c) return;
			var head = ((c.notes || [])[0] || {}).headline || '';
			if (/pro bowl|all-?star/i.test(head)) return;
			var st = null;
			for (var i = stages.length - 1; i >= 0; i--) if (stages[i].re && stages[i].re.test(head)) { st = stages[i]; break; }
			if (!st) return;
			var cs = (c.competitors || []).map(function (x) { return { id: teamId(lg.id, x.team && x.team.abbreviation), win: x.winner === true }; });
			if (cs.length !== 2 || !cs[0].id || !cs[1].id || !ctx.teams[cs[0].id] || !ctx.teams[cs[1].id]) return;
			var key = st.k + ':' + [cs[0].id, cs[1].id].sort().join('-');
			var s = ser[key];
			if (!s) { s = ser[key] = { stage: st.k, a: cs[0].id, b: cs[1].id, wa: 0, wb: 0, need: Math.ceil((st.bo || 1) / 2), done: false, winner: '', last: '' }; list.push(s); }
			var fin = e.status && e.status.type && e.status.type.completed;
			if (fin) {
				var w = cs[0].win ? cs[0].id : cs[1].win ? cs[1].id : '';
				if (w) { games++; if (w === s.a) s.wa++; else s.wb++; }
			}
			s.last = e.date || s.last;
			if (s.wa >= s.need) { s.done = true; s.winner = s.a; } else if (s.wb >= s.need) { s.done = true; s.winner = s.b; }
		});
		var reached = {}, out = {}, inPo = {};
		stages.forEach(function (s) { reached[s.k] = []; });
		list.forEach(function (s) {
			[s.a, s.b].forEach(function (id) { if (reached[s.stage].indexOf(id) < 0) reached[s.stage].push(id); inPo[id] = 1; });
			if (s.done) out[s.winner === s.a ? s.b : s.a] = 1;
		});
		var fin = stages.filter(function (s) { return !s.champ; }).pop(), champ = '';
		list.forEach(function (s) { if (s.stage === fin.k && s.done) champ = s.winner; });
		var chs = stages.filter(function (s) { return s.champ; })[0];
		if (chs) reached[chs.k] = champ ? [champ] : [];
		// once every playoff team has shown up, everyone else is out
		if (Object.keys(inPo).length >= lg.po.teams) ctx.ids.forEach(function (id) { if (!inPo[id]) out[id] = 1; });
		list.sort(function (x, y) { return stages.map(function (s) { return s.k; }).indexOf(x.stage) - stages.map(function (s) { return s.k; }).indexOf(y.stage) || (x.last < y.last ? -1 : 1); });
		return { started: list.length > 0, done: !!champ, champ: champ, games: games, series: list, reached: reached, out: Object.keys(out).sort() };
	}
	// Score playoff picks against results (null results = nothing played yet): per pick 'hit' (reached), 'miss' (out before getting there), 'open'
	function scorePo(ctx, po, res) {
		var lg = ctx.lg, out = { pts: 0, max: poMax(lg), possible: 0, hits: 0, picks: 0, stages: [] };
		po = cleanPo(ctx, po);
		poStages(lg).forEach(function (s) {
			var w = stageWeight(lg, s.k), row = { k: s.k, name: s.name, short: s.short, w: w, hit: 0, n: 0, picks: [] };
			var reached = res && res.reached && res.reached[s.k] || [], outl = res && res.out || [];
			// a stage is settled once all of its places are known
			var full = reached.length >= (s.champ ? 1 : s.slots * (lg.confs ? lg.confs.length : 1));
			po[s.k].forEach(function (id, i) {
				if (!id) { row.picks.push({ id: '', st: 'none', conf: slotConf(lg, s, i) }); return; }
				row.n++; out.picks++;
				var st = reached.indexOf(id) >= 0 ? 'hit' : (outl.indexOf(id) >= 0 || full) ? 'miss' : 'open';
				if (st === 'hit') { row.hit++; out.hits++; out.pts += w; out.possible += w; } else if (st === 'open') out.possible += w;
				row.picks.push({ id: id, st: st, conf: slotConf(lg, s, i) });
			});
			out.stages.push(row);
		});
		return out;
	}
	// a bracket guess from table picks: the top `slots` of each conference list go through to the first picked stage, then the higher pick wins
	function poFromLists(ctx, lists) {
		var lg = ctx.lg, po = emptyPo(lg), st = poStages(lg);
		if (!lg.confs) return po;
		st.forEach(function (s, si) {
			if (s.champ) {
				var prev = po[st[si - 1].k].filter(Boolean), best = '', bi = 99;
				prev.forEach(function (id) { var c = ctx.teams[id].conf, i = (lists[c] || []).indexOf(id); if (i >= 0 && i < bi) { bi = i; best = id; } });
				po[s.k] = [best]; return;
			}
			lg.confs.forEach(function (cf, ci) {
				var src = si === 0 ? (lists[cf.k] || []) : po[st[si - 1].k].slice(ci * st[si - 1].slots, (ci + 1) * st[si - 1].slots);
				if (si > 0) src = src.slice().sort(function (a, b) { return (lists[cf.k] || []).indexOf(a) - (lists[cf.k] || []).indexOf(b); });
				for (var i = 0; i < s.slots; i++) po[s.k][ci * s.slots + i] = src[i] || '';
			});
		});
		return po;
	}

	// ---------- links ----------
	function encodeList(ids) { return ids.map(function (x) { return String(x).toLowerCase(); }).join('.'); }
	function decodeList(s, within) {
		var a = String(s || '').toUpperCase().split(/[.,\s-]+/).filter(Boolean);
		return validList(a, within) ? a : null;
	}
	// playoff picks in a link: stages joined by "_", slots by ".", empty slot "-"
	function encodePo(lg, po) { return poStages(lg).map(function (s) { return (po[s.k] || []).map(function (x) { return x ? String(x).toLowerCase() : '-'; }).join('.'); }).join('_'); }
	function decodePo(ctx, s) {
		var parts = String(s || '').split('_'), po = {};
		poStages(ctx.lg).forEach(function (st, i) { po[st.k] = String(parts[i] || '').toUpperCase().split('.').map(function (x) { return x === '-' ? '' : x; }); });
		return cleanPo(ctx, po);
	}
	function cleanName(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); }

	var DCOL = ['#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626'];
	function distColor(d) { return DCOL[Math.min(4, d)]; }
	function textOn(hex) {
		var h = String(hex || '#777777').replace('#', ''), r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
		var L = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
		var lum = 0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(b);
		return lum > 0.4 ? '#111111' : '#ffffff';
	}
	// season labels: 'end' = the year a season ends (NBA / NHL 2027 = 2026-27), 'start' = the year it starts (soccer 2026 = 2026-27), 'single' = one year
	function seasonLabel(year, lgId) {
		year = +year; if (!year) return '';
		var s = (LEAGUES[lgId || 'nba'] || LEAGUES.nba).season;
		if (s === 'end') return (year - 1) + '-' + String(year).slice(2);
		if (s === 'start') return year + '-' + String(year + 1).slice(2);
		return String(year);
	}
	function logoUrl(u, px) { u = logoOk(u); if (!u) return ''; return 'https://a.espncdn.com/combiner/i?img=' + encodeURIComponent(u.replace('https://a.espncdn.com', '')).replace(/%2F/g, '/') + '&w=' + (px || 64) + '&h=' + (px || 64); }

	// ---------- the first version's API (NBA only), kept for older callers ----------
	var NBA_CTX = makeCtx('nba', null), TEAMS = NBA_CTX.teams, CONF = { E: NBA_CTX.groups.E.slice(), W: NBA_CTX.groups.W.slice() };
	var ORDER = NBA_T.map(function (r) { return r[0]; });
	CONF.E = ORDER.filter(function (id) { return TEAMS[id].conf === 'E'; }); CONF.W = ORDER.filter(function (id) { return TEAMS[id].conf === 'W'; });
	function validPicks(arr, conf) { return validList(arr, CONF[conf]); }

	var api = { LEAGUES: LEAGUES, LEAGUE_ORDER: LEAGUE_ORDER, league: league, makeCtx: makeCtx, groupMeta: groupMeta, views: views, divKeys: divKeys, confKeys: confKeys,
		norm: norm, lev: lev, parseTeam: parseTeam, cleanLine: cleanLine, parseList: parseList, validList: validList, completeList: completeList,
		teamId: teamId, normEspn: normEspn, leagueOrder: leagueOrder, okStandings: okStandings, gamesPlayed: gamesPlayed, recKey: recKey, recText: recText, recShort: recShort,
		positions: positions, maxDist: maxDist, tiersFor: tiersFor, tierIndex: tierIndex, cutFor: cutFor, scoreGroup: scoreGroup, sumMetrics: sumMetrics, scoreLists: scoreLists, groupType: groupType,
		METRICS: METRICS, metric: metric, metricValue: metricValue, metricShare: metricShare,
		poStages: poStages, emptyPo: emptyPo, slotConf: slotConf, stageWeight: stageWeight, poMax: poMax, cleanPo: cleanPo, poFilled: poFilled, poResults: poResults, scorePo: scorePo, poFromLists: poFromLists,
		encodeList: encodeList, decodeList: decodeList, encodePo: encodePo, decodePo: decodePo, cleanName: cleanName, distColor: distColor, textOn: textOn, seasonLabel: seasonLabel, logoUrl: logoUrl, logoOk: logoOk,
		TEAMS: TEAMS, ORDER: ORDER, CONF: CONF, NBA_ESPN: NBA_ESPN, validPicks: validPicks, MAXD: 112 };
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else { root.MESNBA = api; root.MESPicks = api; }
})(typeof window !== 'undefined' ? window : this);

/* MES Picks page script (NBA, NFL, MLB, NHL, La Liga, Premier League: the league is <div id="np" data-lg>). lib.js = MESNBA is prepended by build_tool_apps.py.
   Standings: /api/nba-standings?lg= (edge-cached ESPN + playoff results), else ESPN directly (CORS-open, no playoffs), else the committed sample (local previews, ?mock=1).
   State: localStorage mes-nba-picks:v1 (NBA, the first version's key) / mes-<lg>-picks:v1. Share links ?n=&<group key>=&p= (no server). Leaderboard: /api/nba-picks?lg=. */
(function () {
	'use strict';
	var N = window.MESNBA, root = document.getElementById('np');
	if (!N || !root) return;
	var LGID = root.getAttribute('data-lg') || 'nba', LG = N.league(LGID);
	if (!LG) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = LGID === 'nba' ? 'mes-nba-picks:v1' : 'mes-' + LGID + '-picks:v1';
	var ESPN = 'https://site.api.espn.com/apis/';
	var qs = new URLSearchParams(location.search), LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname), MOCK = qs.get('mock') === '1';
	var EXAMPLE = LGID === 'nba' ? '1 76ers\n2 Celtics\n3 Knicks\n4 Raptors\n5 Cavaliers\n6 Pistons\n7 Pacers\n8 Hawks\n9 Heat\n10 Magic\n11 Hornets\n12 Wizards\n13 Bulls\n14 Bucks\n15 Nets' : '';

	var CTX = N.makeCtx(LGID, null), VIEWS = [], ST = null, CUR_SEASON = 0, CUR_ST = null;
	function uid() { return Math.random().toString(36).slice(2, 10); }
	var S = { sets: [], cur: '', cmp: '', view: '', k: 'w3', ties: true, season: 0, lbB: '', lbM: 'w3', who: 'a', vizAll: false };
	try {
		var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
		if (saved && Array.isArray(saved.sets)) S = Object.assign(S, saved);
	} catch (e) {}
	// the first version's NBA sets kept E / W at the top
	S.sets = (S.sets || []).filter(function (s) { return s && s.id; }).map(function (s) {
		if (!s.lists) s.lists = {};
		if (s.E && !s.lists.E) s.lists.E = s.E; if (s.W && !s.lists.W) s.lists.W = s.W;
		delete s.E; delete s.W;
		if (!s.po) s.po = N.emptyPo(LG);
		return s;
	});
	if (S.conf && !S.view) S.view = S.conf; delete S.conf;
	if (S.lbB === 'both') S.lbB = 'all';
	if (S.lbM === 'top10') S.lbM = 'cut';
	if (['exact', 'w1', 'w2', 'w3', 'tier'].indexOf(S.k) < 0) S.k = 'w3';
	if (!S.sets.length) { var first = { id: uid(), name: 'My picks', lists: {}, po: N.emptyPo(LG) }; S.sets.push(first); S.cur = first.id; }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function setById(id) { for (var i = 0; i < S.sets.length; i++) if (S.sets[i].id === id) return S.sets[i]; return null; }
	function cur() { return setById(S.cur) || (S.cur = S.sets[0].id, S.sets[0]); }
	function cmp() { var c = setById(S.cmp); return c && c.id !== S.cur ? c : null; }
	function az(k) { return (CTX.groups[k] || []).slice(); }
	function isAZ(list, k) { return !list || list.join() === az(k).join(); }
	// every set gets every table (A-Z where missing); lists that no longer fit (a club promoted in soccer) are completed
	function fixSets() {
		S.sets.forEach(function (s) {
			Object.keys(CTX.groups).forEach(function (k) {
				var g = CTX.groups[k];
				if (!N.validList(s.lists[k], g)) s.lists[k] = s.lists[k] ? N.completeList(s.lists[k], g) : g.slice();
			});
			s.po = N.cleanPo(CTX, s.po);
		});
	}
	function view() { for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i].k === S.view) return VIEWS[i]; return VIEWS[0]; }

	function toast(t) { var el = $('np-toast'); el.textContent = t; el.classList.add('tu-toast--show'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('tu-toast--show'); }, 2600); }
	function status(t, err) { var el = $('np-status'); el.hidden = !t; el.textContent = t || ''; el.classList.toggle('err', !!err); }
	function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
	function pct(x) { return Math.round(x * 100) + '%'; }
	function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
	function team(id) { return CTX.teams[id] || { id: id, name: id, full: id, short: id, c1: '#64748b', c2: '#cbd5e1' }; }
	function short(id) { var t = team(id), n = t.short || t.name || id; return n.replace('Trail Blazers', 'Blazers').replace('Timberwolves', 'Wolves'); }
	// a team mark: the ESPN logo on a white chip when there is one, else the colour badge with the short id
	function badge(id, small) {
		var t = team(id), lg = N.logoUrl(t.logo, small ? 40 : 64);
		if (lg && !badge.off) {
			var w = el('span', 'np-logo' + (small ? ' np-logo--s' : '')), img = el('img');
			img.src = lg; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = img.height = small ? 20 : 26;
			img.onerror = function () { w.replaceWith(colorBadge(id, small)); };
			w.appendChild(img); w.title = t.full; return w;
		}
		return colorBadge(id, small);
	}
	function colorBadge(id, small) {
		var t = team(id), b = el('span', 'np-badge' + (small ? ' np-badge--s' : ''), id);
		b.style.background = t.c1; b.style.color = N.textOn(t.c1); b.style.borderColor = t.c2;
		return b;
	}
	function gname(k) { var m = N.groupMeta(CTX, k); return m ? m.short : k; }
	function vname(v) { return v.k === 'L' ? (LG.confs ? 'whole-league' : 'table') : v.k === 'D' ? 'division' : gname(v.k); }

	// ---------- standings ----------
	function getJson(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
	function direct(season) {
		var q = season ? '?season=' + season : '', base = ESPN + 'v2/sports/' + LG.sport + '/standings';
		return Promise.all([getJson(base + q), LG.divs ? getJson(base + (q ? q + '&' : '?') + 'level=3').catch(function () { return null; }) : null, getJson(ESPN + 'site/v2/sports/' + LG.sport + '/teams?limit=100').catch(function () { return null; })])
			.then(function (a) {
				var s = N.normEspn(LGID, a[0], a[1], a[2]);
				if (!N.okStandings(s, LGID)) throw new Error('bad shape');
				s.source = 'ESPN'; s.generated = new Date().toISOString(); s.seasonName = N.seasonLabel(s.season, LGID); s.po = null; s.direct = true;
				return s;
			});
	}
	function sample() { return getJson('/' + LG.slug + '/data/sample.json').then(function (j) { j.sample = true; return j; }); }
	function loadStandings(season) {
		var q = '?lg=' + LGID + (season ? '&season=' + season : '');
		if (MOCK) return sample();
		return (LOCAL ? Promise.reject(new Error('local')) : getJson('/api/nba-standings' + q).then(function (j) { if (!N.okStandings(j, LGID)) throw new Error('bad'); return j; }))
			.catch(function () { return direct(season); })
			.catch(function (e) { if (season && season !== CUR_SEASON) throw e; return sample(); });
	}
	function useStandings(st) {
		ST = st;
		CTX = N.makeCtx(LGID, st);
		VIEWS = N.views(CTX);
		if (!view() || VIEWS.every(function (v) { return v.k !== S.view; })) S.view = VIEWS[0].k;
		var wanted = qs.get('v'); if (wanted && VIEWS.some(function (v) { return v.k === wanted; })) { S.view = wanted; useStandings.keep = true; qs.delete('v'); }
		fixSets();
	}
	function showStandings(season) {
		status('Loading the standings…');
		return loadStandings(season).then(function (st) {
			if (!CUR_SEASON || !season) { CUR_SEASON = st.season; CUR_ST = st; }
			useStandings(st); status('');
			S.season = st.season === CUR_SEASON ? 0 : st.season;
			fromLink(); render();
			if (st.sample) status('Showing a saved copy of the standings (' + new Date(st.generated).toLocaleString() + '): the live ones could not be loaded here.');
		}).catch(function () { status('Could not load those standings. Check your connection and press Refresh.', true); });
	}
	function fillSeasons() {
		var sel = $('np-season'); sel.innerHTML = '';
		for (var y = CUR_SEASON; y > CUR_SEASON - 4; y--) {
			var o = el('option', null, N.seasonLabel(y, LGID) + (y === CUR_SEASON ? (CUR_ST && CUR_ST.over ? ' (final)' : ' (now)') : ' (final)')); o.value = y === CUR_SEASON ? '0' : String(y); sel.appendChild(o);
		}
		sel.value = String(S.season || 0);
		var v = view(), gp = ST.gp ? (v.po ? ST.gp.L : ST.gp[v.groups[0]]) : 0, t = new Date(ST.generated);
		$('np-upd').textContent = (gp ? 'about ' + Math.round(gp) + ' games played' : 'no games played yet') + ' · ' + t.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}
	function banner() {
		var b = $('np-banner'), msg = '';
		if (!ST) { b.hidden = true; return; }
		var next = LG.season === 'single' ? String(ST.season + 1) : N.seasonLabel(ST.season + 1, LGID);
		if (S.season) msg = 'You are looking at the final ' + N.seasonLabel(ST.season, LGID) + ' standings. The leaderboard is for the current season.';
		else if (ST.over) msg = 'The ' + ST.seasonName + ' regular season is over: these are the final standings, so the table scores are final and the board is closed.' +
			(ST.po && ST.po.started && !ST.po.done ? ' The playoffs are on: see how your playoff picks are doing on the Playoffs tab.' : ST.po && ST.po.done ? ' ' + team(ST.po.champ).full + ' won it all.' : '') +
			' You can already make and save picks for ' + next + ' here; they are scored once its first games are played.';
		else if (!ST.started) msg = 'No games played yet in ' + ST.seasonName + ': make your picks now, and the scores start with the first games.';
		b.hidden = !msg; b.textContent = msg;
	}

	// ---------- scoring helpers ----------
	function scoreView(set, v, st) {
		st = st || ST;
		if (!st || !set) return null;
		var r = N.scoreLists(CTX, set.lists, st, v.groups, { ties: S.ties });
		return r.m ? r : null;
	}
	function fmtMetric(m, k) {
		if (k === 'pts') return m.pts + ' / ' + 3 * m.n;
		if (k === 'close') return pct(m.close);
		if (k === 'rho') return (m.rho >= 0 ? '' : '−') + Math.abs(m.rho).toFixed(2);
		if (k === 'dist') return m.dist + ' (' + (m.dist / m.n).toFixed(1) + ' a team)';
		return m[k] + ' / ' + m.n;
	}
	var K_LABEL = { exact: 'in the exact spot', w1: 'within 1 spot', w2: 'within 2 spots', w3: 'within 3 spots', tier: 'in the right tier', cut: 'on the right side of the line' };
	function posLabel(t) { return t.lo === t.hi ? ord(t.pos) : S.ties ? 'T' + t.lo + '–' + t.hi : ord(t.pos); }
	function tierText(k) {
		var tiers = N.tiersFor(LG, N.groupType(CTX, k), (CTX.groups[k] || []).length), cut = N.cutFor(LG, N.groupType(CTX, k), (CTX.groups[k] || []).length);
		return { tiers: tiers.map(function (t) { return t.name + ' ' + (t.from === t.to ? t.from : t.from + '-' + t.to); }).join(', '), cut: cut.label };
	}

	// ---------- render ----------
	function render() {
		if (!ST) return;
		var set = cur(), v = view();
		var tabs = $('np-tabs'); tabs.innerHTML = '';
		VIEWS.forEach(function (x) {
			var b = el('button', null, x.name); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.view = x.k; b.setAttribute('aria-selected', String(x.k === v.k));
			b.tabIndex = x.k === v.k ? 0 : -1; tabs.appendChild(b);
		});
		var ss = $('np-set'); ss.innerHTML = '';
		S.sets.forEach(function (s) { var o = el('option', null, s.name); o.value = s.id; ss.appendChild(o); });
		ss.value = set.id;
		var cs = $('np-cmp'); cs.innerHTML = ''; var o0 = el('option', null, 'nobody'); o0.value = ''; cs.appendChild(o0);
		S.sets.forEach(function (s) { if (s.id !== set.id) { var o = el('option', null, s.name); o.value = s.id; cs.appendChild(o); } });
		cs.value = cmp() ? S.cmp : '';
		$('np-del').disabled = S.sets.length < 2;
		root.classList.toggle('np-pomode', !!v.po);
		Array.prototype.forEach.call($('np-k').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.k === S.k)); });
		$('np-ties').checked = S.ties;
		fillSeasons(); banner();
		if (v.po) { renderPo(); renderPoScore(); renderPoResults(); }
		else { renderLists(); renderScore(); renderViz(); renderTable(); }
		renderCompare(); renderShare(); renderPost();
		save();
	}

	// --- editor: one list per table of the tab (divisions = several short lists) ---
	function renderLists() {
		var set = cur(), v = view(), box = $('np-lists'), sc = scoreView(set, v), byId = {};
		if (sc) Object.keys(sc.parts).forEach(function (k) { sc.parts[k].teams.forEach(function (t) { byId[t.id] = t; }); });
		$('np-edit-title').textContent = set.name + ': ' + (v.k === 'D' ? 'division' : v.k === 'L' ? (LG.confs ? 'whole-league' : LG.name) : v.name) + ' picks';
		box.innerHTML = '';
		box.classList.toggle('np-lists--multi', v.groups.length > 1);
		v.groups.forEach(function (k) {
			var list = set.lists[k], n = list.length, wrap = el('div', 'np-listwrap');
			if (v.groups.length > 1) wrap.appendChild(el('h3', 'np-lh', N.groupMeta(CTX, k).name));
			var ol = el('ol', 'np-list'); ol.dataset.g = k; ol.setAttribute('aria-label', 'Your predicted ' + N.groupMeta(CTX, k).name + ' order, first to last');
			var tiers = N.tiersFor(LG, N.groupType(CTX, k), n), cuts = tiers.slice(0, -1).map(function (t) { return t.to; });
			list.forEach(function (id, i) {
				var t = team(id), li = el('li', 'np-row'); li.dataset.id = id;
				if (cuts.indexOf(i + 1) >= 0) li.classList.add('np-cutafter');
				var rk = el('select', 'np-rank'); rk.setAttribute('aria-label', 'Spot for ' + t.full);
				for (var p = 1; p <= n; p++) { var o = el('option', null, String(p)); o.value = String(p); rk.appendChild(o); }
				rk.value = String(i + 1);
				var g = el('button', 'np-grip'); g.type = 'button'; g.setAttribute('aria-label', 'Move ' + t.full + ', now picked ' + ord(i + 1)); g.innerHTML = '<span aria-hidden="true">⠇⠇</span>';
				li.appendChild(rk); li.appendChild(g); li.appendChild(badge(id));
				var nm = el('span', 'np-tname'); nm.appendChild(el('b', null, short(id)));
				if (t.city && t.city !== t.name && LG.recType !== 'soc') nm.appendChild(el('small', null, ' ' + t.city));
				li.appendChild(nm);
				var s = byId[id];
				if (s && ST.started) {
					var chip = el('span', 'np-now', posLabel(s)); chip.style.borderColor = N.distColor(s.d);
					chip.title = 'Now ' + posLabel(s) + ' (' + N.recText(LG, s.row) + '): ' + (s.d ? s.d + ' spot' + (s.d > 1 ? 's' : '') + ' off' : 'right spot');
					var dot = el('i', 'np-dot'); dot.style.background = N.distColor(s.d); chip.insertBefore(dot, chip.firstChild);
					li.appendChild(chip);
				}
				var up = el('button', 'np-mv', '▲'), dn = el('button', 'np-mv', '▼');
				up.type = dn.type = 'button'; up.dataset.mv = '-1'; dn.dataset.mv = '1';
				up.setAttribute('aria-label', 'Move ' + t.name + ' up'); dn.setAttribute('aria-label', 'Move ' + t.name + ' down');
				up.disabled = i === 0; dn.disabled = i === n - 1;
				li.appendChild(up); li.appendChild(dn);
				ol.appendChild(li);
			});
			wrap.appendChild(ol); box.appendChild(wrap);
		});
		var anyAZ = v.groups.some(function (k) { return isAZ(set.lists[k], k); });
		$('np-hint').textContent = anyAZ ? 'A list still in A-Z order: drag each team (by its handle, on a phone too) to where you think it will finish, use the arrows, pick a spot from the number, or paste a list.'
			: 'Drag a team by its handle, use the arrows, or tap the number to send it to another spot. The chip on the right is where the team is now, coloured by how far off you are.';
		var fromC = $('np-fromconf');
		fromC.hidden = !(LG.confs && (v.k === 'L' || v.k === 'D'));
		fromC.textContent = v.k === 'L' ? 'Merge my conference lists' : 'Order from my conference lists';
		if (LGID === 'mlb') fromC.textContent = v.k === 'L' ? 'Merge my AL + NL lists' : 'Order from my AL / NL lists';
		$('np-example').hidden = !EXAMPLE;
		$('np-paste-lab').textContent = 'One team per line, numbered or not, or separated by commas. Nicknames, cities, short forms and small typos are fine.' + (v.groups.length > 1 ? ' On this tab, paste into one table at a time: ' : '');
		var pt = $('np-paste-g'); pt.innerHTML = ''; pt.hidden = v.groups.length < 2;
		v.groups.forEach(function (k) { var o = el('option', null, N.groupMeta(CTX, k).name); o.value = k; pt.appendChild(o); });
	}

	function renderScore() {
		var set = cur(), v = view(), sc = scoreView(set, v), hero = $('np-hero'), box = $('np-metrics');
		hero.innerHTML = ''; box.innerHTML = '';
		$('np-score-title').textContent = 'How these ' + (v.k === 'L' ? (LG.confs ? 'whole-league' : LG.name) : v.k === 'D' ? 'division' : v.name) + ' picks are doing';
		$('np-kpick').hidden = false;
		var tt = v.groups.length === 1 ? tierText(v.groups[0]) : null;
		$('np-tiers').textContent = tt ? 'Tiers: ' + tt.tiers + '. Line: ' + tt.cut + '.' : 'Each division is scored on its own and the scores are added up. Tier = division winner or not.';
		if (!sc) { hero.textContent = 'Loading…'; $('np-both').textContent = ''; return; }
		var m = sc.m, val = m[S.k];
		var big = el('div', 'np-big'); big.appendChild(el('b', null, String(val))); big.appendChild(el('span', null, '/ ' + m.n));
		hero.appendChild(big);
		var side = el('div', 'np-heros');
		side.appendChild(el('div', 'np-herol', 'teams ' + K_LABEL[S.k]));
		side.appendChild(el('div', 'np-herop', ST.started ? pct(val / m.n) + ' accuracy' : 'no games played yet'));
		var bar = el('div', 'np-bar'), fill = el('i'); fill.style.width = (val / m.n * 100) + '%'; bar.appendChild(fill); side.appendChild(bar);
		hero.appendChild(side);
		var tbl = el('table', 'np-mt');
		N.METRICS.forEach(function (d) {
			var tr = el('tr'); if (d.k === S.k) tr.className = 'on';
			tr.appendChild(el('th', null, d.k === 'cut' && tt ? tt.cut : d.k === 'tier' && v.k === 'D' ? 'Division winner or not' : d.label));
			tr.appendChild(el('td', 'np-mv2', fmtMetric(m, d.k)));
			var td = el('td', 'np-mb'), b = el('span', 'np-bar np-bar--s'), f = el('i'); f.style.width = (N.metricShare(m, d.k) * 100) + '%'; b.appendChild(f); td.appendChild(b); tr.appendChild(td);
			tbl.appendChild(tr);
		});
		box.appendChild(tbl);
		// a one-line summary across every table
		var bits = [];
		VIEWS.forEach(function (x) {
			if (x.po || x.k === v.k) return;
			if (x.groups.some(function (k) { return isAZ(set.lists[k], k); })) return;
			var s = scoreView(set, x); if (s) bits.push(x.name + ' ' + s.m[S.k] + '/' + s.m.n);
		});
		$('np-both').textContent = bits.length ? 'Your other tables, ' + K_LABEL[S.k] + ': ' + bits.join(' · ') + '.' : '';
	}

	// --- the picture: your order on the left, the standings on the right, a line per team coloured by how far off ---
	function vizSet() { var b = cmp(); return S.who === 'b' && b ? b : cur(); }
	function renderViz() {
		var box = $('np-viz'), set = vizSet(), v = view(), sc = scoreView(set, v);
		var who = $('np-who'), b = cmp();
		who.hidden = !b;
		if (b) {
			who.innerHTML = '';
			[['a', cur().name], ['b', b.name]].forEach(function (x) { var bt = el('button', null, x[1]); bt.type = 'button'; bt.dataset.who = x[0]; bt.setAttribute('aria-pressed', String((S.who === 'b' ? 'b' : 'a') === x[0])); who.appendChild(bt); });
		}
		$('np-viz-title').textContent = set.name + '’s ' + vname(v) + ' order vs the standings now';
		var lg = $('np-legend'); lg.innerHTML = '';
		[['right spot', 0], ['1 off', 1], ['2 off', 2], ['3 off', 3], ['4+ off', 4]].forEach(function (x) { var s = el('span'), i = el('i'); i.style.background = N.distColor(x[1]); s.appendChild(i); s.appendChild(document.createTextNode(x[0])); lg.appendChild(s); });
		box.innerHTML = '';
		box.classList.toggle('np-viz--grid', v.groups.length > 1);
		if (!sc) return;
		box._sc = sc;
		v.groups.forEach(function (k) {
			var part = sc.parts[k], holder = el('div', 'np-vizpart');
			if (v.groups.length > 1) holder.appendChild(el('div', 'np-vizh', N.groupMeta(CTX, k).name + ': ' + part.m[S.k] + '/' + part.m.n));
			box.appendChild(holder);
			drawPicture(holder, part, k, v.groups.length > 1);
		});
		var svgs = box.querySelectorAll('svg');
		Array.prototype.forEach.call(svgs, function (svg) { svg.addEventListener('pointerover', vizHover); svg.addEventListener('click', vizHover); svg.addEventListener('pointerleave', function () { vizFocus(null); }); });
	}
	function drawPicture(holder, sc, k, small) {
		var n = sc.n, card = $('np-vizcard');
		var fill = root.classList.contains('np-fillmode') && card.classList.contains('np-expanded') || document.fullscreenElement === card;
		var W = Math.max(280, holder.clientWidth || $('np-viz').clientWidth || 600);
		var rowH = fill && !small ? Math.max(20, Math.min(60, (window.innerHeight - 150) / (n + 0.6))) : (small ? 30 : n > 20 ? (W < 480 ? 26 : 28) : (W < 480 ? 30 : 34));
		var top = 28, H = top + rowH * n + 6, colW = Math.min(W * 0.38, 260), xL = 0, xR = W - colW, fs = Math.min(15, Math.max(10.5, rowH * 0.42));
		var showCity = colW > 170;
		var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'np-svg');
		svg.setAttribute('role', 'img');
		svg.setAttribute('aria-label', N.groupMeta(CTX, k).name + ': ' + sc.m[S.k] + ' of ' + sc.m.n + ' ' + K_LABEL[S.k] + '. ' + sc.teams.map(function (t) { return team(t.id).name + ' picked ' + ord(t.pred) + ', now ' + posLabel(t); }).join('; '));
		var mk = function (tag, a, txt, parent) { var e = document.createElementNS(ns, tag); for (var q in a) e.setAttribute(q, a[q]); if (txt != null) e.textContent = txt; (parent || svg).appendChild(e); return e; };
		var y = function (p) { return top + (p - 1) * rowH; };
		sc.tiers.forEach(function (t, i) {
			mk('rect', { x: 0, y: y(t.from), width: W, height: rowH * (t.to - t.from + 1), class: 'np-band np-band' + Math.min(i, 3) });
			mk('text', { x: W / 2, y: y(t.from) + 13, class: 'np-bandl', 'text-anchor': 'middle' }, (W - 2 * colW > 170 ? t.name + ' (' + (t.from === t.to ? t.from : t.from + '–' + t.to) + ')' : W - 2 * colW > 70 ? t.name : ''));
		});
		mk('text', { x: xL + 4, y: 18, class: 'np-colh' }, 'Picked');
		mk('text', { x: W - 4, y: 18, class: 'np-colh', 'text-anchor': 'end' }, 'Now');
		var lines = mk('g', { class: 'np-lines' }), rowsG = mk('g', {}), byPos = {};
		sc.teams.forEach(function (t) { byPos[t.pos] = t; });
		if (S.ties) {
			for (var p = 1; p <= n; p++) {
				var t0 = byPos[p]; if (!t0 || t0.lo !== p || t0.hi === t0.lo) continue;
				mk('path', { d: 'M' + (xR - 5) + ' ' + (y(t0.lo) + 5) + ' h-4 V' + (y(t0.hi) + rowH - 5) + ' h4', class: 'np-tie' }, null, rowsG);
			}
		}
		function teamCell(t, x, right, p) {
			var g = mk('g', { class: 'np-cell' }, null, rowsG); g.dataset.id = t.id;
			var tm = team(t.id), cy = y(p) + rowH / 2, bw = fs * 3.2, bh = rowH - 8;
			mk('rect', { x: x, y: y(p) + 2, width: colW, height: rowH - 4, rx: 6, class: 'np-cellbg' }, null, g);
			mk('text', { x: right ? x + colW - 6 : x + 6, y: cy + fs * 0.36, class: 'np-num', 'text-anchor': right ? 'end' : 'start' }, right ? (S.ties && t.lo !== t.hi ? 'T' + t.lo : String(p)) : String(p), g);
			var bx = right ? x + colW - 6 - fs * 1.9 - bw : x + 6 + fs * 1.6, lgo = N.logoUrl(tm.logo, 40);
			if (lgo && !badge.off) {
				var sz = Math.min(bh, fs * 1.7), lx = right ? bx + bw - sz : bx;
				mk('rect', { x: lx - 1, y: cy - sz / 2 - 1, width: sz + 2, height: sz + 2, rx: 4, class: 'np-logobg' }, null, g);
				var im = mk('image', { x: lx, y: cy - sz / 2, width: sz, height: sz, href: lgo }, null, g);
				im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', lgo);
				bw = sz; bx = lx;
			} else {
				mk('rect', { x: bx, y: cy - bh / 2, width: bw, height: bh, rx: 4, fill: tm.c1, stroke: tm.c2, 'stroke-width': 2 }, null, g);
				mk('text', { x: bx + bw / 2, y: cy + fs * 0.34, 'text-anchor': 'middle', class: 'np-btxt', fill: N.textOn(tm.c1), 'font-size': fs * 0.82 }, t.id, g);
			}
			var label = short(t.id) + (right && showCity ? ' ' + N.recShort(LG, t.row) : '');
			if (!showCity && right) label = N.recShort(LG, t.row);
			if (!showCity && !right && label.length > 11) label = label.slice(0, 10) + '…';
			mk('text', { x: right ? bx - 6 : bx + bw + 6, y: cy + fs * 0.34, class: 'np-tn', 'text-anchor': right ? 'end' : 'start', 'font-size': fs }, label, g);
		}
		sc.teams.forEach(function (t) {
			teamCell(t, xL, false, t.pred);
			teamCell(t, xR, true, t.pos);
			var x1 = xL + colW, x2 = xR, y1 = y(t.pred) + rowH / 2, y2 = y(t.pos) + rowH / 2, mx = (x1 + x2) / 2;
			var path = mk('path', { d: 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2, stroke: N.distColor(t.d), class: 'np-line', 'stroke-width': t.d === 0 ? 4 : 3 }, null, lines);
			path.dataset.id = t.id;
		});
		holder.appendChild(svg);
	}
	function vizFocus(id) {
		var svgs = $('np-viz').querySelectorAll('svg');
		Array.prototype.forEach.call(svgs, function (svg) {
			svg.classList.toggle('np-hl', !!id);
			Array.prototype.forEach.call(svg.querySelectorAll('[data-id]'), function (e) { e.classList.toggle('on', e.dataset.id === id); });
		});
		var info = $('np-vizinfo'), sc = $('np-viz')._sc;
		if (!id || !sc) { info.textContent = 'Tap or hover a team to follow its line.'; return; }
		var t = null; Object.keys(sc.parts).forEach(function (k) { sc.parts[k].teams.forEach(function (x) { if (x.id === id) t = x; }); });
		if (!t) return;
		info.textContent = team(id).full + ': picked ' + ord(t.pred) + ', now ' + posLabel(t) + ' at ' + N.recText(LG, t.row) + (t.row.gb && LG.recType === 'wl' ? ', ' + t.row.gb + ' games back' : '') + '. ' +
			(t.d === 0 ? 'Right spot.' : t.d + ' spot' + (t.d > 1 ? 's' : '') + ' ' + (t.signed < 0 ? 'lower than you picked' : 'higher than you picked') + '.') + (t.tierOk ? ' Right tier.' : ' Different tier.');
	}
	function vizHover(e) { var g = e.target.closest && e.target.closest('[data-id]'); if (g) vizFocus(g.dataset.id); }

	// --- the standings table of the tab, with your pick next to each team ---
	function renderTable() {
		var v = view(), box = $('np-tables'), set = cur(), sc = scoreView(set, v), byId = {};
		if (sc) Object.keys(sc.parts).forEach(function (k) { sc.parts[k].teams.forEach(function (t) { byId[t.id] = t; }); });
		$('np-table-title').textContent = (v.k === 'D' ? 'Division' : v.k === 'L' ? (LG.confs ? 'Whole-league' : LG.name) : v.long) + ' standings' + (S.season ? ' (' + N.seasonLabel(ST.season, LGID) + ')' : '');
		box.innerHTML = '';
		box.classList.toggle('np-tables--multi', v.groups.length > 1);
		v.groups.forEach(function (k) {
			var rows = ST.groups[k] || [], wrap = el('div', 'tu-table-wrap np-stwrap'), tbl = el('table', 'tu-table np-st');
			if (v.groups.length > 1) wrap.appendChild(el('div', 'np-vizh', N.groupMeta(CTX, k).name));
			var tiers = N.tiersFor(LG, N.groupType(CTX, k), rows.length), cuts = tiers.slice(0, -1).map(function (t) { return t.to; });
			var h = el('tr'), cols = ['#', 'Team', LG.recType === 'soc' ? 'Pts' : LG.recType === 'nhl' ? 'Pts' : 'W-L', LG.recType === 'soc' ? 'W-D-L' : LG.recType === 'nhl' ? 'W-L-OT' : (k === 'L' || N.groupType(CTX, k) === 'div' ? 'Win %' : 'GB'), 'GP', 'Your pick'];
			if (LG.recType === 'soc') cols.splice(4, 0, 'GD');
			cols.forEach(function (c) { h.appendChild(el('th', null, c)); });
			var thead = el('thead'); thead.appendChild(h); tbl.appendChild(thead);
			var tb = el('tbody');
			rows.forEach(function (r, i) {
				var tr = el('tr'); if (cuts.indexOf(i + 1) >= 0) tr.className = 'np-cutrow';
				var s = byId[r.id];
				tr.appendChild(el('td', 'np-r', s && S.ties && s.lo !== s.hi ? 'T' + s.lo : String(i + 1)));
				var tdT = el('td'), tc = el('span', 'np-tcell'); tc.appendChild(badge(r.id, true)); tc.appendChild(el('span', null, short(r.id))); tdT.appendChild(tc); tr.appendChild(tdT);
				if (LG.recType === 'soc') { tr.appendChild(el('td', 'np-b', String(r.pts || 0))); tr.appendChild(el('td', null, r.w + '-' + (r.d || 0) + '-' + r.l)); tr.appendChild(el('td', null, (r.gd > 0 ? '+' : '') + (r.gd || 0))); }
				else if (LG.recType === 'nhl') { tr.appendChild(el('td', 'np-b', String(r.pts || 0))); tr.appendChild(el('td', null, r.w + '-' + r.l + '-' + (r.otl || 0))); }
				else { tr.appendChild(el('td', 'np-b', N.recShort(LG, r))); tr.appendChild(el('td', null, k === 'L' || N.groupType(CTX, k) === 'div' ? r.pct.toFixed(3).replace(/^0/, '') : (r.gb ? String(r.gb) : '–'))); }
				tr.appendChild(el('td', null, String(r.gp)));
				var pk = el('td', 'np-off');
				if (s) { var dt = el('i', 'np-dot'); dt.style.background = N.distColor(s.d); pk.appendChild(dt); pk.appendChild(document.createTextNode(ord(s.pred) + (s.d ? ' (' + s.d + ' off)' : ' ✓'))); }
				tr.appendChild(pk);
				tb.appendChild(tr);
			});
			tbl.appendChild(tb); wrap.appendChild(tbl); box.appendChild(wrap);
		});
	}

	// --- playoffs ---
	function poTeamsFor(s, si, conf) {
		var set = cur(), stages = N.poStages(LG);
		if (si === 0) {
			var base = conf ? (ST.groups[conf] || []).map(function (r) { return r.id; }) : CTX.ids.slice();
			return base;
		}
		var prev = stages[si - 1], arr = set.po[prev.k];
		if (s.champ) return arr.filter(Boolean);
		var ci = LG.confs.map(function (c) { return c.k; }).indexOf(conf);
		return arr.slice(ci * prev.slots, (ci + 1) * prev.slots).filter(Boolean);
	}
	function renderPo() {
		var set = cur(), box = $('np-po'), stages = N.poStages(LG), res = ST.po, sc = N.scorePo(CTX, set.po, res);
		$('np-po-title').textContent = set.name + ': playoff picks' + (S.season ? ' (' + N.seasonLabel(ST.season, LGID) + ')' : '');
		box.innerHTML = '';
		stages.forEach(function (s, si) {
			var col = el('div', 'np-postage'), row = sc.stages[si];
			var hd = el('div', 'np-posh'); hd.appendChild(el('b', null, s.name)); hd.appendChild(el('small', null, ' ' + row.w + ' pt' + (row.w > 1 ? 's' : '') + ' each'));
			col.appendChild(hd);
			var groupsC = s.champ ? [null] : LG.confs.map(function (c) { return c.k; });
			groupsC.forEach(function (conf, ci) {
				var sub = el('div', 'np-poconf');
				if (conf) sub.appendChild(el('div', 'np-pocl', gname(conf)));
				var opts = poTeamsFor(s, si, conf), n = s.champ ? 1 : s.slots;
				for (var i = 0; i < n; i++) {
					var idx = s.champ ? 0 : ci * s.slots + i, val = set.po[s.k][idx] || '', pk = row.picks[idx];
					var slot = el('label', 'np-slot' + (pk && pk.st !== 'none' ? ' np-slot--' + pk.st : ''));
					var mark = val ? badge(val, true) : el('span', 'np-slotempty', '?');
					slot.appendChild(mark);
					var sel = el('select'); sel.dataset.stage = s.k; sel.dataset.idx = String(idx);
					sel.setAttribute('aria-label', s.name + (conf ? ', ' + gname(conf) : '') + ', pick ' + (i + 1));
					var o0 = el('option', null, opts.length ? 'Pick a team…' : (si ? 'Fill the round before first' : 'Pick a team…')); o0.value = ''; sel.appendChild(o0);
					var taken = set.po[s.k].filter(function (x, j) { return x && j !== idx; });
					opts.forEach(function (id) { if (taken.indexOf(id) >= 0) return; var o = el('option', null, team(id).full); o.value = id; sel.appendChild(o); });
					sel.value = val;
					slot.appendChild(sel);
					if (pk && pk.st === 'hit') slot.appendChild(el('span', 'np-slotst', '✓'));
					else if (pk && pk.st === 'miss') slot.appendChild(el('span', 'np-slotst', '✗'));
					sub.appendChild(slot);
				}
				col.appendChild(sub);
			});
			box.appendChild(col);
		});
		var closed = res && res.started;
		$('np-po-note').textContent = closed ? 'The playoffs have started: you can still change these picks here, but the playoff leaderboard only takes picks made before the first game.'
			: 'Pick who gets to each round. A later round only offers the teams you sent through the round before. ' + (res ? '' : 'Picks are scored once the playoffs start.');
		$('np-po-fill').textContent = 'Fill from my ' + LG.confs.map(function (c) { return c.short; }).join(' / ') + ' picks';
	}
	function renderPoScore() {
		var set = cur(), res = ST.po, sc = N.scorePo(CTX, set.po, res), hero = $('np-hero'), box = $('np-metrics');
		hero.innerHTML = ''; box.innerHTML = '';
		$('np-score-title').textContent = 'How these playoff picks are doing';
		$('np-kpick').hidden = true; $('np-tiers').textContent = ''; $('np-both').textContent = '';
		var big = el('div', 'np-big'); big.appendChild(el('b', null, String(sc.pts))); big.appendChild(el('span', null, '/ ' + sc.max));
		hero.appendChild(big);
		var side = el('div', 'np-heros');
		side.appendChild(el('div', 'np-herol', 'playoff points'));
		side.appendChild(el('div', 'np-herop', !res || !res.started ? 'the playoffs have not started' : res.done ? 'final: ' + team(res.champ).full + ' won' : 'still possible: ' + sc.possible + ' of ' + sc.max));
		var bar = el('div', 'np-bar'), fill = el('i'); fill.style.width = (sc.max ? sc.pts / sc.max * 100 : 0) + '%'; bar.appendChild(fill); side.appendChild(bar);
		hero.appendChild(side);
		var tbl = el('table', 'np-mt');
		sc.stages.forEach(function (r) {
			var tr = el('tr');
			tr.appendChild(el('th', null, r.name));
			tr.appendChild(el('td', 'np-mv2', r.n ? r.hit + ' of ' + r.n + ' right' + (r.n < r.picks.length ? ' (' + (r.picks.length - r.n) + ' empty)' : '') : 'not picked'));
			tr.appendChild(el('td', 'np-mv2', r.hit * r.w + ' pts'));
			tbl.appendChild(tr);
		});
		box.appendChild(tbl);
		box.appendChild(el('p', 'np-small', 'Points double each round: ' + N.poStages(LG).map(function (s) { return s.short + ' ' + N.stageWeight(LG, s.k); }).join(', ') + '. A pick counts when that team reaches that round.'));
	}
	function renderPoResults() {
		var res = ST.po, box = $('np-pores'), set = cur(), mine = {};
		N.poStages(LG).forEach(function (s) { (set.po[s.k] || []).forEach(function (id) { if (id) mine[id] = 1; }); });
		box.innerHTML = '';
		$('np-pores-title').textContent = 'Playoff results' + (ST.season ? ' ' + N.seasonLabel(ST.season, LGID) : '');
		if (!res || !res.started) {
			var when = LG.po.months(ST.season)[0], y = when.slice(0, 4), mo = +when.slice(4, 6);
			box.appendChild(el('p', 'np-small', 'No playoff games yet. They are due to start around ' + new Date(Date.UTC(+y, mo - 1, 15)).toLocaleString([], { month: 'long', year: 'numeric', timeZone: 'UTC' }) + '; results show here as they come in (from ESPN).'));
			return;
		}
		if (res.champ) { var ch = el('div', 'np-champ'); ch.appendChild(badge(res.champ)); ch.appendChild(el('b', null, team(res.champ).full + ' are the champions')); box.appendChild(ch); }
		LG.po.stages.filter(function (s) { return !s.champ; }).forEach(function (s) {
			var list = res.series.filter(function (x) { return x.stage === s.k; });
			if (!list.length) return;
			var sec = el('div', 'np-rsec'); sec.appendChild(el('h3', 'np-lh', s.name));
			list.forEach(function (x) {
				var r = el('div', 'np-series');
				[[x.a, x.wa], [x.b, x.wb]].forEach(function (p, i) {
					var t = el('span', 'np-sside' + (x.winner === p[0] ? ' np-sw' : x.done ? ' np-sl' : '') + (mine[p[0]] ? ' np-mine' : ''));
					t.appendChild(badge(p[0], true)); t.appendChild(el('span', null, short(p[0])));
					if (s.bo > 1) t.appendChild(el('b', 'np-sws', String(p[1])));
					r.appendChild(t);
					if (!i) r.appendChild(el('span', 'np-vs', s.bo > 1 ? '–' : 'vs'));
				});
				r.appendChild(el('small', 'np-sst', x.done ? (s.bo > 1 ? short(x.winner) + ' won' : short(x.winner) + ' won') : 'in progress'));
				sec.appendChild(r);
			});
			box.appendChild(sec);
		});
		box.appendChild(el('p', 'np-small', 'Teams you picked anywhere in your bracket are outlined.'));
	}
	$('np-po').addEventListener('change', function (e) {
		var sel = e.target.closest('select'); if (!sel) return;
		var set = cur(); set.po[sel.dataset.stage][+sel.dataset.idx] = sel.value;
		set.po = N.cleanPo(CTX, set.po);
		render();
	});
	$('np-po-fill').onclick = function () { var set = cur(); set.po = N.poFromLists(CTX, set.lists); render(); toast('Bracket filled from your table picks: the higher pick wins every round'); };
	$('np-po-clear').onclick = function () { if (!N.poFilled(cur().po) || confirm('Clear all your playoff picks?')) { cur().po = N.emptyPo(LG); render(); } };

	function renderCompare() {
		var a = cur(), b = cmp(), box = $('np-compare'), v = view();
		box.hidden = !b || !ST;
		if (!b || !ST) return;
		var ct = $('np-ct'), tt = $('np-tt');
		$('np-cmp-title').textContent = 'Head to head (' + v.name + '): ' + a.name + ' vs ' + b.name;
		ct.innerHTML = ''; tt.innerHTML = '';
		var h = el('tr'); h.appendChild(el('th', null, '')); h.appendChild(el('th', null, a.name)); h.appendChild(el('th', null, b.name)); ct.appendChild(h);
		if (v.po) {
			var A = N.scorePo(CTX, a.po, ST.po), B = N.scorePo(CTX, b.po, ST.po);
			[['Points', 'pts'], ['Still possible', 'possible'], ['Right picks', 'hits']].forEach(function (x) {
				var tr = el('tr'); tr.appendChild(el('th', null, x[0]));
				var ta = el('td', null, String(A[x[1]])), tb = el('td', null, String(B[x[1]]));
				if (A[x[1]] > B[x[1]]) ta.className = 'np-win'; else if (B[x[1]] > A[x[1]]) tb.className = 'np-win';
				tr.appendChild(ta); tr.appendChild(tb); ct.appendChild(tr);
			});
			var hh = el('tr'); ['Round', a.name, b.name].forEach(function (x) { hh.appendChild(el('th', null, x)); }); tt.appendChild(hh);
			A.stages.forEach(function (r, i) {
				var tr = el('tr'); tr.appendChild(el('td', null, r.short || r.name));
				[r, B.stages[i]].forEach(function (x) { tr.appendChild(el('td', 'np-off', x.picks.filter(function (p) { return p.id; }).map(function (p) { return short(p.id) + (p.st === 'hit' ? ' ✓' : p.st === 'miss' ? ' ✗' : ''); }).join(', ') || '–')); });
				tt.appendChild(tr);
			});
			return;
		}
		var SA = scoreView(a, v), SB = scoreView(b, v);
		if (!SA || !SB) { box.hidden = true; return; }
		var wa = 0, wb = 0;
		N.METRICS.forEach(function (d) {
			var va = N.metricValue(SA.m, d.k), vb = N.metricValue(SB.m, d.k), tr = el('tr');
			tr.appendChild(el('th', null, d.label));
			var ta = el('td', null, fmtMetric(SA.m, d.k)), tb = el('td', null, fmtMetric(SB.m, d.k));
			if (va > vb + 1e-9) { ta.className = 'np-win'; wa++; } else if (vb > va + 1e-9) { tb.className = 'np-win'; wb++; }
			tr.appendChild(ta); tr.appendChild(tb); ct.appendChild(tr);
		});
		var cap = el('caption', null, wa === wb ? 'Level: ' + wa + ' scores each.' : (wa > wb ? a.name : b.name) + ' leads on ' + Math.max(wa, wb) + ' of ' + N.METRICS.length + ' scores.');
		ct.insertBefore(cap, ct.firstChild);
		var hh2 = el('tr'); ['Team', 'Now', a.name, b.name].forEach(function (x) { hh2.appendChild(el('th', null, x)); }); tt.appendChild(hh2);
		var all = [], bm = {};
		Object.keys(SB.parts).forEach(function (k) { SB.parts[k].teams.forEach(function (t) { bm[t.id] = t; }); });
		Object.keys(SA.parts).forEach(function (k) { all = all.concat(SA.parts[k].teams.slice().sort(function (x, y) { return x.pos - y.pos; })); });
		all.forEach(function (t) {
			var tr = el('tr'), td = el('td'); td.appendChild(badge(t.id, true)); td.appendChild(document.createTextNode(' ' + short(t.id))); tr.appendChild(td);
			tr.appendChild(el('td', null, posLabel(t)));
			[t, bm[t.id]].forEach(function (x) { if (!x) { tr.appendChild(el('td')); return; } var c2 = el('td', 'np-off', ord(x.pred) + (x.d ? ' (' + x.d + ' off)' : ' ✓')); var dt = el('i', 'np-dot'); dt.style.background = N.distColor(x.d); c2.insertBefore(dt, c2.firstChild); tr.appendChild(c2); });
			tt.appendChild(tr);
		});
	}

	// ---------- share links: ?n=Name&<group key lowercase>=ids...&p=playoffs (NBA's first links used e / w: the same keys) ----------
	function shareUrl(set, onlyView) {
		var u = new URL('/' + LG.slug, location.origin), v = view();
		u.searchParams.set('n', set.name);
		Object.keys(CTX.groups).forEach(function (k) {
			if (onlyView && v.groups.indexOf(k) < 0) return;
			if (!isAZ(set.lists[k], k)) u.searchParams.set(k.toLowerCase(), N.encodeList(set.lists[k]));
		});
		if (N.poFilled(set.po) && (!onlyView || v.po)) u.searchParams.set('p', N.encodePo(LG, set.po));
		if (onlyView) u.searchParams.set('v', v.k);
		return u.toString();
	}
	function renderShare() {
		var set = cur(), only = $('np-share-only').checked;
		$('np-link').value = shareUrl(set, only);
		var parts = [];
		VIEWS.forEach(function (x) {
			if (only && x.k !== view().k) return;
			if (x.po ? N.poFilled(set.po) : x.groups.every(function (k) { return !isAZ(set.lists[k], k); })) parts.push(x.name);
		});
		$('np-share-what').textContent = parts.length ? 'The link carries: ' + parts.join(', ') + '.' : 'Nothing picked yet: the link opens the page with this name only.';
		$("np-share-only-t").textContent = ' Only this tab (' + view().name + ')';
	}
	var linked = false;
	function fromLink() {
		if (linked) return; linked = true;
		var got = {}, any = false;
		Object.keys(CTX.groups).forEach(function (k) { var d = N.decodeList(qs.get(k.toLowerCase()), CTX.groups[k]); if (d) { got[k] = d; any = true; } });
		var po = qs.get('p') ? N.decodePo(CTX, qs.get('p')) : null;
		if (po && N.poFilled(po)) any = true; else po = null;
		if (!any) { try { if (location.search) history.replaceState(null, '', location.pathname + location.hash); } catch (x) {} return; }
		var name = N.cleanName(qs.get('n')) || 'Shared picks';
		var same = S.sets.filter(function (s) { return Object.keys(got).every(function (k) { return s.lists[k] && s.lists[k].join() === got[k].join(); }) && (!po || N.encodePo(LG, s.po) === N.encodePo(LG, po)); })[0];
		if (same) { S.cur = same.id; toast('These picks are already saved here as "' + same.name + '"'); }
		else {
			var s = { id: uid(), name: uniqueName(name), lists: {}, po: po || N.emptyPo(LG) };
			Object.keys(CTX.groups).forEach(function (k) { s.lists[k] = got[k] || az(k); });
			S.sets.push(s);
			var prev = S.cur; S.cur = s.id; if (prev && prev !== s.id) S.cmp = prev;
			toast('Loaded ' + s.name + '’s picks from the link');
		}
		var first = VIEWS.filter(function (x) { return x.po ? !!po : x.groups.every(function (k) { return got[k]; }); })[0];
		if (first && !useStandings.keep) S.view = first.k;
		try { history.replaceState(null, '', location.pathname + location.hash); } catch (x) {}
	}

	// ---------- editing ----------
	function listOf(g) { return cur().lists[g]; }
	function move(g, id, delta, abs) {
		var a = listOf(g), i = a.indexOf(id); if (i < 0) return;
		var j = abs != null ? abs : Math.max(0, Math.min(a.length - 1, i + delta));
		if (j === i) return;
		a.splice(i, 1); a.splice(j, 0, id);
		render();
		var gEl = $('np-lists').querySelector('.np-list[data-g="' + g + '"] [data-id="' + id + '"] .np-grip'); if (gEl) gEl.focus({ preventScroll: abs != null });
	}
	var lists = $('np-lists'), drag = null;
	lists.addEventListener('click', function (e) {
		var b = e.target.closest('.np-mv'); if (!b) return;
		var row = b.closest('.np-row'), g = row.parentNode.dataset.g, id = row.dataset.id; move(g, id, +b.dataset.mv);
		var again = lists.querySelector('.np-list[data-g="' + g + '"] [data-id="' + id + '"] [data-mv="' + b.dataset.mv + '"]'); if (again && !again.disabled) again.focus();
	});
	lists.addEventListener('change', function (e) {
		var s = e.target.closest('.np-rank'); if (!s) return;
		var row = s.closest('.np-row'); move(row.parentNode.dataset.g, row.dataset.id, 0, +s.value - 1);
		toast(team(row.dataset.id).name + ' moved to ' + ord(+s.value));
	});
	lists.addEventListener('keydown', function (e) {
		var g = e.target.closest('.np-grip'); if (!g) return;
		var row = g.closest('.np-row'), gk = row.parentNode.dataset.g, id = row.dataset.id, k = e.key, n = listOf(gk).length;
		if (k === 'ArrowUp') move(gk, id, -1); else if (k === 'ArrowDown') move(gk, id, 1); else if (k === 'Home') move(gk, id, 0, 0); else if (k === 'End') move(gk, id, 0, n - 1); else return;
		e.preventDefault();
	});
	lists.addEventListener('pointerdown', function (e) {
		var row = e.target.closest('.np-row'); if (!row || e.button) return;
		var grip = e.target.closest('.np-grip');
		if (!grip && (e.pointerType !== 'mouse' || e.target.closest('button, select'))) return;
		e.preventDefault();
		var r = row.getBoundingClientRect(), ol = row.parentNode;
		drag = { row: row, ol: ol, id: row.dataset.id, y0: e.clientY, off: e.clientY - r.top, moved: false, pid: e.pointerId };
		try { ol.setPointerCapture(e.pointerId); } catch (x) {}
	});
	function rowsTop(ol) { var m = new Map(); Array.prototype.forEach.call(ol.children, function (r) { m.set(r, r.getBoundingClientRect().top); }); return m; }
	var scrollT = 0;
	lists.addEventListener('pointermove', function (e) {
		if (!drag || e.pointerId !== drag.pid) return;
		if (!drag.moved && Math.abs(e.clientY - drag.y0) < 5) return;
		if (!drag.moved) { drag.moved = true; drag.row.classList.add('np-dragging'); drag.ol.classList.add('np-isdrag'); if (navigator.vibrate) try { navigator.vibrate(8); } catch (x) {} }
		var row = drag.row, ol = drag.ol, y = e.clientY, before = null;
		var rows = Array.prototype.filter.call(ol.children, function (r) { return r !== row; });
		for (var i = 0; i < rows.length; i++) { var b = rows[i].getBoundingClientRect(); if (y < b.top + b.height / 2) { before = rows[i]; break; } }
		if ((before && row.nextSibling !== before) || (!before && ol.lastChild !== row)) {
			var t0 = rowsTop(ol);
			row.style.transform = '';
			ol.insertBefore(row, before);
			Array.prototype.forEach.call(ol.children, function (r) {
				if (r === row) return;
				var d = t0.get(r) - r.getBoundingClientRect().top;
				if (d) { r.style.transition = 'none'; r.style.transform = 'translateY(' + d + 'px)'; r.getBoundingClientRect(); r.style.transition = ''; r.style.transform = ''; }
			});
			Array.prototype.forEach.call(ol.children, function (r, k) { var s = r.querySelector('.np-rank'); if (s) s.value = String(k + 1); });
		}
		row.style.transform = '';
		var nat = row.getBoundingClientRect().top;
		row.style.transform = 'translateY(' + (y - drag.off - nat) + 'px)';
		// keep scrolling while the finger / pointer sits near the top or bottom of the window
		cancelAnimationFrame(scrollT);
		var edge = y < 80 ? -1 : y > window.innerHeight - 80 ? 1 : 0;
		if (edge) { var step = function () { if (!drag) return; window.scrollBy(0, edge * 10); scrollT = requestAnimationFrame(step); }; scrollT = requestAnimationFrame(step); }
	});
	function endDrag() {
		cancelAnimationFrame(scrollT);
		if (!drag) return;
		var d = drag; drag = null;
		d.ol.classList.remove('np-isdrag');
		d.row.classList.remove('np-dragging'); d.row.style.transform = '';
		if (!d.moved) return;
		var g = d.ol.dataset.g, order = Array.prototype.map.call(d.ol.children, function (r) { return r.dataset.id; });
		if (N.validList(order, CTX.groups[g])) cur().lists[g] = order;
		render();
		var gr = lists.querySelector('.np-list[data-g="' + g + '"] [data-id="' + d.id + '"] .np-grip'); if (gr) gr.focus({ preventScroll: true });
	}
	lists.addEventListener('pointerup', endDrag); lists.addEventListener('pointercancel', endDrag);
	lists.addEventListener('lostpointercapture', endDrag);

	// paste a list
	function pasteOpen(on) { $('np-paste').hidden = !on; $('np-paste-open').setAttribute('aria-expanded', String(on)); if (on) $('np-paste-t').focus(); $('np-paste-msg').textContent = ''; }
	$('np-paste-open').onclick = function () { pasteOpen($('np-paste').hidden); };
	$('np-paste-x').onclick = function () { pasteOpen(false); };
	$('np-example').onclick = function () { if (S.view !== 'E') { S.view = 'E'; render(); } pasteOpen(true); $('np-paste-t').value = EXAMPLE; $('np-paste-msg').textContent = 'An East example, as someone sent it to us. Press "Use this list".'; };
	$('np-paste-go').onclick = function () {
		var v = view(), g = v.groups.length > 1 ? $('np-paste-g').value : v.groups[0], within = CTX.groups[g], gn = N.groupMeta(CTX, g).name;
		var r = N.parseList(CTX, $('np-paste-t').value, within), msg = [];
		if (!r.ids.length) { $('np-paste-msg').textContent = 'No team names found in that text.'; return; }
		var other = r.other.map(function (id) { return team(id).name; });
		cur().lists[g] = N.completeList(r.ids, within, cur().lists[g]);
		var got = r.ids.filter(function (id) { return within.indexOf(id) >= 0; }).length, n = within.length;
		msg.push('Read ' + got + ' of ' + n + ' teams.');
		if (r.unknown.length) msg.push('Not recognised: ' + r.unknown.join(', ') + '.');
		if (r.dupes.length) msg.push('Listed twice (second one ignored): ' + r.dupes.map(function (id) { return team(id).name; }).join(', ') + '.');
		if (other.length) msg.push('Not in the ' + gn + ' (left out): ' + other.join(', ') + '.');
		if (got < n) msg.push('The ' + (n - got) + ' missing team' + (n - got > 1 ? 's were' : ' was') + ' added at the end in your previous order: drag ' + (n - got > 1 ? 'them' : 'it') + ' into place.');
		var fz = r.items.filter(function (x) { return x.fuzzy && x.id; }).map(function (x) { return '"' + x.text + '" = ' + team(x.id).name; });
		if (fz.length) msg.push('Guessed: ' + fz.join(', ') + '.');
		render();
		$('np-paste-msg').textContent = msg.join(' ');
		if (got === n && !r.unknown.length && !r.dupes.length) { pasteOpen(false); toast('Picks updated from your list'); }
	};
	$('np-fill').onclick = function () { if (!ST) return; view().groups.forEach(function (k) { cur().lists[k] = (ST.groups[k] || []).map(function (r) { return r.id; }); }); render(); toast('Copied the current standings: now change what you disagree with'); };
	$('np-az').onclick = function () { view().groups.forEach(function (k) { cur().lists[k] = az(k); }); render(); };
	$('np-fromconf').onclick = function () {
		var set = cur(), v = view(), ck = N.confKeys(CTX);
		if (v.k === 'L') {   // interleave: 1st of each conference, then 2nd ...
			var out = [], max = Math.max.apply(null, ck.map(function (k) { return set.lists[k].length; }));
			for (var i = 0; i < max; i++) ck.forEach(function (k) { if (set.lists[k][i]) out.push(set.lists[k][i]); });
			set.lists.L = out;
		} else v.groups.forEach(function (d) { var c = N.groupMeta(CTX, d).conf; set.lists[d] = set.lists[c].filter(function (id) { return CTX.groups[d].indexOf(id) >= 0; }); });
		render(); toast(v.k === 'L' ? 'Merged: 1st of each conference first, then the 2nds, and so on' : 'Each division now follows your conference order');
	};

	// sets
	function uniqueName(n) { var base = N.cleanName(n) || 'Picks', name = base, i = 2; while (S.sets.some(function (s) { return s.name === name; })) name = base + ' ' + i++; return name; }
	function blankSet(name) { var s = { id: uid(), name: name, lists: {}, po: N.emptyPo(LG) }; Object.keys(CTX.groups).forEach(function (k) { s.lists[k] = az(k); }); return s; }
	$('np-set').onchange = function () { S.cur = this.value; if (S.cmp === S.cur) S.cmp = ''; S.who = 'a'; render(); };
	$('np-cmp').onchange = function () { S.cmp = this.value; S.who = 'a'; render(); };
	$('np-new').onclick = function () { var n = prompt('Name for the new set of picks (e.g. a person):', uniqueName('Picks')); if (n == null) return; var s = blankSet(uniqueName(n)); S.sets.push(s); S.cur = s.id; render(); };
	$('np-rename').onclick = function () { var s = cur(), n = prompt('New name:', s.name); if (n == null || !N.cleanName(n)) return; s.name = N.cleanName(n) === s.name ? s.name : uniqueName(n); render(); };
	$('np-dup').onclick = function () { var s = cur(), c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.name = uniqueName(s.name + ' copy'); delete c.lb; delete c.from; delete c.lbName; S.sets.push(c); S.cur = c.id; render(); toast('Copied: change this one, the original stays as it was'); };
	$('np-del').onclick = function () {
		if (S.sets.length < 2) return;
		var s = cur(); if (!confirm('Delete "' + s.name + '"? This cannot be undone.' + (s.lb ? ' (It stays on the leaderboard unless you remove it there first.)' : ''))) return;
		S.sets = S.sets.filter(function (x) { return x.id !== s.id; }); S.cur = S.sets[0].id; if (S.cmp === s.id) S.cmp = ''; render();
	};
	$('np-export').onclick = function () {
		var blob = new Blob([JSON.stringify({ app: 'mes-picks', lg: LGID, v: 2, sets: S.sets.map(function (s) { var c = JSON.parse(JSON.stringify(s)); delete c.lb; return c; }) }, null, 1)], { type: 'application/json' });
		var a = el('a'); a.href = URL.createObjectURL(blob); a.download = LG.slug + '-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
	};
	$('np-import').onclick = function () { $('np-importf').click(); };
	$('np-importf').onchange = function () {
		var f = this.files && this.files[0]; this.value = ''; if (!f) return;
		f.text().then(function (t) {
			var j = JSON.parse(t), n = 0;
			if (!j || j.app !== 'mes-picks' || j.lg !== LGID || !Array.isArray(j.sets)) throw new Error('That file is not a ' + LG.name + ' picks backup.');
			j.sets.forEach(function (s) {
				if (!s || !s.lists) return;
				var c = blankSet(uniqueName(N.cleanName(s.name) || 'Picks'));
				Object.keys(CTX.groups).forEach(function (k) { if (N.validList(s.lists[k], CTX.groups[k])) c.lists[k] = s.lists[k].slice(); });
				c.po = N.cleanPo(CTX, s.po); S.sets.push(c); n++;
			});
			render(); toast(n ? 'Restored ' + n + ' set' + (n > 1 ? 's' : '') : 'No picks found in that file');
		}).catch(function (e) { toast(e.message || 'Could not read that file'); });
	};
	$('np-tabs').onclick = function (e) { var b = e.target.closest('[data-view]'); if (!b) return; S.view = b.dataset.view; render(); };
	$('np-tabs').onkeydown = function (e) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		var i = VIEWS.map(function (v) { return v.k; }).indexOf(view().k), n = VIEWS.length;
		S.view = VIEWS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n].k; render();
		$('np-tabs').querySelector('[data-view="' + S.view + '"]').focus();
	};
	$('np-k').onclick = function (e) { var b = e.target.closest('[data-k]'); if (!b) return; S.k = b.dataset.k; render(); };
	$('np-ties').onchange = function () { S.ties = this.checked; render(); };
	$('np-ties-q').onclick = function () { var n = $('np-ties-note'); n.hidden = !n.hidden; this.setAttribute('aria-expanded', String(!n.hidden)); };
	$('np-who').onclick = function (e) { var b = e.target.closest('[data-who]'); if (!b) return; S.who = b.dataset.who; renderViz(); };
	$('np-season').onchange = function () { var y = +this.value; showStandings(y || null).then(renderLb); };
	$('np-refresh').onclick = function () { showStandings(S.season || null).then(renderLb); };
	$('np-share-only').onchange = renderShare;
	$('np-copy').onclick = function () {
		var v = $('np-link').value;
		(navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Link copied'); }, function () { $('np-link').select(); document.execCommand('copy'); toast('Link copied'); });
	};
	$('np-native').hidden = !navigator.share;
	$('np-native').onclick = function () { navigator.share({ title: cur().name + '’s ' + LG.name + ' picks', text: 'My ' + LG.name + ' predictions on MES Picks:', url: $('np-link').value }).catch(function () {}); };
	$('np-copytext').onclick = function () {
		var set = cur(), v = view(), lines = [cur().name + '’s ' + LG.name + ' picks: ' + v.long];
		if (v.po) N.poStages(LG).forEach(function (s) { lines.push(s.name + ': ' + set.po[s.k].filter(Boolean).map(short).join(', ')); });
		else v.groups.forEach(function (k) { if (v.groups.length > 1) lines.push(N.groupMeta(CTX, k).name); set.lists[k].forEach(function (id, i) { lines.push((i + 1) + '. ' + team(id).full); }); });
		lines.push($('np-link').value);
		var t = lines.join('\n');
		(navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('List copied as text'); }, function () { toast('Copy did not work in this browser'); });
	};

	// fill window / full screen for the picture, the standings table and the playoff results
	function expander(card, redraw) {
		var bar = card.querySelector('.np-xbtns'); if (!bar) return;
		var bf = el('button', 'tu-btn tu-btn--ghost', '⤢ Fill window'), bs = el('button', 'tu-btn tu-btn--ghost', '⛶ Full screen'), bx = el('button', 'tu-btn tu-btn--ghost np-only-fill', 'Close (Esc)');
		[bf, bs, bx].forEach(function (b) { b.type = 'button'; bar.appendChild(b); });
		function setFill(on) {
			Array.prototype.forEach.call(root.querySelectorAll('.np-expanded'), function (c) { if (c !== card) c.classList.remove('np-expanded'); });
			card.classList.toggle('np-expanded', on); root.classList.toggle('np-fillmode', on); document.documentElement.classList.toggle('np-noscroll', on);
			if (redraw) redraw();
		}
		bf.onclick = function () { setFill(!card.classList.contains('np-expanded')); };
		bx.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); setFill(false); };
		bs.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (card.requestFullscreen) card.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); };
		card._fill = setFill;
	}
	expander($('np-vizcard'), function () { renderViz(); });
	expander($('np-tablecard'));
	expander($('np-porescard'));
	document.addEventListener('fullscreenchange', function () {
		var fs = document.fullscreenElement;
		Array.prototype.forEach.call(root.querySelectorAll('.tu-card'), function (c) { c.classList.toggle('np-fscard', c === fs); });
		root.classList.toggle('np-fsmode', !!(fs && root.contains(fs)));
		setTimeout(function () { if (!view().po) renderViz(); }, 50);
	});
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('np-fillmode')) { var c = root.querySelector('.np-expanded'); if (c && c._fill) c._fill(false); } });
	function wide() { root.classList.toggle('np-wide', root.clientWidth >= 820); }
	wide(); if (window.ResizeObserver) new ResizeObserver(wide).observe(root);
	var rw = 0;
	if (window.ResizeObserver) new ResizeObserver(function () { var w = $('np-viz').clientWidth; if (Math.abs(w - rw) > 4 && ST && !view().po) { rw = w; renderViz(); } }).observe($('np-viz'));
	window.addEventListener('resize', function () { if ((root.classList.contains('np-fillmode') || document.fullscreenElement) && ST && !view().po) renderViz(); });

	// ---------- leaderboard ----------
	var LB = { rows: null };
	var mSel = $('np-lb-m');
	N.METRICS.forEach(function (d) { var o = el('option', null, 'Rank by: ' + d.label); o.value = d.k; mSel.appendChild(o); });
	function boards() {
		var b = [];
		N.confKeys(CTX).forEach(function (k) { b.push([k, gname(k)]); });
		if (N.confKeys(CTX).length) b.push(['all', 'Both']);
		b.push(['L', LG.confs ? 'League' : 'Table']);
		if (N.divKeys(CTX).length) b.push(['D', 'Divisions']);
		if (LG.po) b.push(['P', 'Playoffs']);
		return b;
	}
	function boardName(k) { var b = boards().filter(function (x) { return x[0] === k; })[0]; return b ? b[1] : k; }
	function renderLb() {
		if (!ST) return;
		var bs = boards(); if (!bs.some(function (x) { return x[0] === S.lbB; })) S.lbB = bs[0][0];
		var seg = $('np-lb-board'); seg.innerHTML = '';
		bs.forEach(function (x) { var b = el('button', null, x[1]); b.type = 'button'; b.dataset.b = x[0]; b.setAttribute('aria-pressed', String(x[0] === S.lbB)); seg.appendChild(b); });
		mSel.value = S.lbM; mSel.hidden = S.lbB === 'P';
		$('np-lb-season').textContent = CUR_SEASON ? N.seasonLabel(CUR_SEASON, LGID) : '';
		var tbl = $('np-lbt'), more = $('np-lb-more'); tbl.innerHTML = ''; more.textContent = '';
		if (S.season) { more.textContent = 'The leaderboard is for the ' + N.seasonLabel(CUR_SEASON, LGID) + ' season: switch the standings back to it to see the board.'; return; }
		if (LOCAL || MOCK) { more.textContent = 'The leaderboard works on mes.fm itself (this local preview has no server).'; return; }
		more.textContent = 'Loading the leaderboard…';
		getJson('/api/nba-picks?lg=' + LGID + '&board=' + S.lbB + '&m=' + S.lbM).then(function (j) {
			more.textContent = '';
			LB.rows = j.rows || [];
			if (!LB.rows.length) { more.textContent = 'No picks posted yet for ' + boardName(S.lbB) + '. Be the first!'; return; }
			var mine = S.sets.map(function (s) { return s.lb && s.lb.id; }).filter(Boolean), isP = S.lbB === 'P', d = N.metric(S.lbM);
			var h = el('tr'); (isP ? ['#', 'Name', 'Points', 'Still possible', 'Right', 'Picked', ''] : ['#', 'Name', d.short, 'Accuracy', 'Exact', 'Picked', '']).forEach(function (x) { h.appendChild(el('th', null, x)); }); tbl.appendChild(h);
			LB.rows.forEach(function (r) {
				var tr = el('tr'); if (mine.indexOf(r.id) >= 0) tr.className = 'np-me';
				tr.appendChild(el('td', 'np-r', String(r.r)));
				var nm = el('td', null, r.n); if (mine.indexOf(r.id) >= 0) nm.appendChild(el('span', 'np-you', 'you')); tr.appendChild(nm);
				if (isP) {
					tr.appendChild(el('td', 'np-sv', r.m.pts + ' / ' + r.m.max)); tr.appendChild(el('td', null, String(r.m.possible))); tr.appendChild(el('td', null, r.m.hits + '/' + r.m.picks));
					tr.appendChild(el('td', 'np-pk', r.pg ? 'after ' + r.pg + ' playoff games' : 'before the playoffs'));
				} else {
					tr.appendChild(el('td', 'np-sv', fmtMetric(r.m, S.lbM)));
					tr.appendChild(el('td', null, pct(r.share)));
					tr.appendChild(el('td', null, r.m.exact + '/' + r.m.n));
					var keys = S.lbB === 'all' ? N.confKeys(CTX) : S.lbB === 'D' ? N.divKeys(CTX) : [S.lbB];
					var gp = Math.max.apply(null, keys.map(function (k) { return (r.gp && r.gp[k]) || 0; }));
					var pk = el('td', 'np-pk', gp ? 'after ' + Math.round(gp) + ' game' + (Math.round(gp) === 1 ? '' : 's') : 'before the season'); if (gp) pk.classList.add('np-late');
					pk.title = new Date(r.t).toLocaleString(); tr.appendChild(pk);
				}
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
		var s = ex || blankSet(uniqueName(r.n + ' (board)'));
		if (!ex) s.from = r.id;
		Object.keys(r.L || {}).forEach(function (k) { var d = CTX.groups[k] && N.decodeList(r.L[k], CTX.groups[k]); if (d) s.lists[k] = d; });
		if (r.P) s.po = N.decodePo(CTX, r.P);
		if (!ex) S.sets.push(s);
		if (s.id === S.cur) { toast('That is the set you are looking at'); return; }
		S.cmp = s.id;
		if (S.lbB === 'P') S.view = 'P'; else if (S.lbB !== 'all') S.view = S.lbB;
		render();
		$('np-compare').scrollIntoView({ behavior: 'smooth', block: 'start' });
		toast('Comparing with ' + r.n);
	};
	// what a post would include: every table that is not still A-Z (while the season is on), and the playoff picks (before the playoffs)
	function postParts(s) {
		var st = CUR_ST || ST, L = {}, names = [];
		if (!st.over) Object.keys(CTX.groups).forEach(function (k) { if (!isAZ(s.lists[k], k)) L[k] = s.lists[k]; });
		VIEWS.forEach(function (v) { if (!v.po && v.groups.every(function (k) { return L[k]; })) names.push(v.name); });
		var poOpen = !(st.po && st.po.started), P = poOpen && N.poFilled(s.po) ? s.po : undefined;
		if (P) names.push('Playoffs');
		return { L: L, P: P, names: names, poOpen: poOpen };
	}
	function renderPost() {
		var s = cur(), posted = s.lb && s.lb.season === CUR_SEASON, pp = postParts(s), st = CUR_ST || ST;
		if (document.activeElement !== $('np-lb-name')) $('np-lb-name').value = s.lbName || s.name;
		$('np-lb-post').textContent = posted ? 'Update my entry' : 'Post these picks';
		$('np-lb-del').hidden = !posted;
		$('np-post').hidden = !!S.season || !!s.from || (st.over && !pp.poOpen && !posted);
		$('np-lb-what').textContent = pp.names.length ? 'Posts: ' + pp.names.join(', ') + '.' + (st.over ? ' (Tables are closed: the regular season is over.)' : '') + (!pp.poOpen ? ' (Playoff picks are closed: the playoffs have started.)' : '')
			: 'Nothing to post yet: put at least one table in order' + (pp.poOpen && LG.po ? ' or make some playoff picks' : '') + '.';
	}
	function lbMsg(t, err) { var m = $('np-lb-msg'); m.textContent = t; m.classList.toggle('err', !!err); }
	function post(body) {
		body.lg = LGID;
		return fetch('/api/nba-picks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
			.then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; }); });
	}
	$('np-lb-post').onclick = function () {
		if (LOCAL || MOCK) { lbMsg('Posting works on mes.fm itself (this local preview has no server).', true); return; }
		var s = cur(), name = N.cleanName($('np-lb-name').value), pp = postParts(s);
		if (!name) { lbMsg('Type a name for the board.', true); return; }
		var posted = s.lb && s.lb.season === CUR_SEASON;
		if (!posted && !Object.keys(pp.L).length && !pp.P) { lbMsg('Put at least one table in order first' + (LG.po ? ', or make some playoff picks' : '') + '.', true); return; }
		var body = { a: posted ? 'update' : 'submit', name: name, L: pp.L, season: CUR_SEASON };
		if (pp.P) body.P = pp.P;
		if (posted) { body.id = s.lb.id; body.key = s.lb.key; }
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
	// a logo that will not load (blocked third-party images) switches every badge to the colour version
	var probe = new Image(); probe.onerror = function () { badge.off = true; if (ST) render(); }; probe.src = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/' + (LG.recType === 'soc' ? 'soccer/500/83' : LG.id + '/500/' + (LGID === 'nhl' ? 'bos' : LGID === 'nfl' ? 'kc' : LGID === 'mlb' ? 'nyy' : 'bos')) + '.png&w=16&h=16';

	showStandings(null).then(renderLb);
})();
