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
