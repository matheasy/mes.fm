/* MES Timezone Converter -- mes.fm/timezone
 *
 * Convert one wall-clock time in a chosen IANA zone to any number of other
 * zones, DST-correct, entirely in the browser. No dependencies -- all the
 * heavy lifting is Intl.DateTimeFormat + the standard "wall time -> instant"
 * offset dance.
 */
(function () {
	"use strict";

	var $ = function (id) { return document.getElementById(id); };
	var STORE = "mes-tz-v1";
	var HOME = "America/Vancouver";               // Richmond, BC shares Vancouver's zone
	var DEFAULT_TARGETS = [
		"America/New_York", "America/Chicago", "America/Toronto",
		"Europe/London", "Europe/Paris", "Asia/Dubai", "Asia/Kolkata",
		"Asia/Tokyo", "Australia/Sydney", "UTC"
	];
	var POPULAR = [
		"America/Vancouver", "America/Los_Angeles", "America/Denver", "America/Phoenix",
		"America/Chicago", "America/New_York", "America/Toronto", "America/Halifax",
		"America/Mexico_City", "America/Bogota", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
		"UTC", "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris", "Europe/Madrid",
		"Europe/Berlin", "Europe/Rome", "Europe/Amsterdam", "Europe/Zurich", "Europe/Stockholm",
		"Europe/Athens", "Europe/Istanbul", "Europe/Moscow", "Africa/Casablanca", "Africa/Lagos",
		"Africa/Cairo", "Africa/Nairobi", "Africa/Johannesburg", "Asia/Jerusalem", "Asia/Riyadh",
		"Asia/Dubai", "Asia/Tehran", "Asia/Karachi", "Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka",
		"Asia/Bangkok", "Asia/Jakarta", "Asia/Singapore", "Asia/Manila", "Asia/Hong_Kong",
		"Asia/Shanghai", "Asia/Taipei", "Asia/Seoul", "Asia/Tokyo", "Australia/Perth",
		"Australia/Adelaide", "Australia/Brisbane", "Australia/Sydney", "Pacific/Auckland",
		"Pacific/Honolulu", "Pacific/Fiji"
	];
	// last-resort list if Intl.supportedValuesOf is unavailable
	var FALLBACK_ZONES = POPULAR.concat([
		"America/Anchorage", "America/Edmonton", "America/Winnipeg", "America/Regina",
		"America/St_Johns", "America/Lima", "America/Santiago", "America/Caracas",
		"Atlantic/Reykjavik", "Atlantic/Azores", "Europe/Brussels", "Europe/Vienna",
		"Europe/Prague", "Europe/Warsaw", "Europe/Budapest", "Europe/Bucharest",
		"Europe/Helsinki", "Europe/Kyiv", "Asia/Baku", "Asia/Yerevan", "Asia/Tashkent",
		"Asia/Almaty", "Asia/Colombo", "Asia/Yangon", "Asia/Ho_Chi_Minh", "Asia/Kuala_Lumpur",
		"Asia/Novosibirsk", "Asia/Vladivostok", "Australia/Darwin", "Pacific/Guam",
		"Pacific/Port_Moresby", "Pacific/Tongatapu"
	]);

	// country flag for a handful of common zones (cosmetic; "" is fine)
	var FLAG = {
		"America/Vancouver": "🇨🇦", "America/Toronto": "🇨🇦",
		"America/Halifax": "🇨🇦", "America/Edmonton": "🇨🇦",
		"America/Winnipeg": "🇨🇦", "America/St_Johns": "🇨🇦",
		"America/Los_Angeles": "🇺🇸", "America/Denver": "🇺🇸",
		"America/Phoenix": "🇺🇸", "America/Chicago": "🇺🇸",
		"America/New_York": "🇺🇸", "America/Anchorage": "🇺🇸",
		"Pacific/Honolulu": "🇺🇸", "America/Mexico_City": "🇲🇽",
		"America/Bogota": "🇨🇴", "America/Lima": "🇵🇪",
		"America/Sao_Paulo": "🇧🇷", "America/Argentina/Buenos_Aires": "🇦🇷",
		"America/Santiago": "🇨🇱", "UTC": "🌐",
		"Europe/London": "🇬🇧", "Europe/Dublin": "🇮🇪",
		"Europe/Lisbon": "🇵🇹", "Europe/Paris": "🇫🇷",
		"Europe/Madrid": "🇪🇸", "Europe/Berlin": "🇩🇪",
		"Europe/Rome": "🇮🇹", "Europe/Amsterdam": "🇳🇱",
		"Europe/Zurich": "🇨🇭", "Europe/Stockholm": "🇸🇪",
		"Europe/Athens": "🇬🇷", "Europe/Istanbul": "🇹🇷",
		"Europe/Moscow": "🇷🇺", "Europe/Kyiv": "🇺🇦",
		"Africa/Casablanca": "🇲🇦", "Africa/Lagos": "🇳🇬",
		"Africa/Cairo": "🇪🇬", "Africa/Nairobi": "🇰🇪",
		"Africa/Johannesburg": "🇿🇦", "Asia/Jerusalem": "🇮🇱",
		"Asia/Riyadh": "🇸🇦", "Asia/Dubai": "🇦🇪",
		"Asia/Tehran": "🇮🇷", "Asia/Karachi": "🇵🇰",
		"Asia/Kolkata": "🇮🇳", "Asia/Kathmandu": "🇳🇵",
		"Asia/Dhaka": "🇧🇩", "Asia/Bangkok": "🇹🇭",
		"Asia/Jakarta": "🇮🇩", "Asia/Singapore": "🇸🇬",
		"Asia/Manila": "🇵🇭", "Asia/Hong_Kong": "🇭🇰",
		"Asia/Shanghai": "🇨🇳", "Asia/Taipei": "🇹🇼",
		"Asia/Seoul": "🇰🇷", "Asia/Tokyo": "🇯🇵",
		"Australia/Perth": "🇦🇺", "Australia/Adelaide": "🇦🇺",
		"Australia/Brisbane": "🇦🇺", "Australia/Sydney": "🇦🇺",
		"Australia/Darwin": "🇦🇺", "Pacific/Auckland": "🇳🇿",
		"Pacific/Fiji": "🇫🇯"
	};

	/* ---- search aliases: type "Boston" or "France", get the right zone ----
	   IANA ids only carry one representative city per zone, so map the common
	   country names, big cities, US states and zone abbreviations onto them. */

	var COUNTRY_ZONE = {
		"united states": "America/New_York", "usa": "America/New_York", "us": "America/New_York", "america": "America/New_York",
		"canada": "America/Toronto", "mexico": "America/Mexico_City",
		"united kingdom": "Europe/London", "uk": "Europe/London", "britain": "Europe/London", "great britain": "Europe/London",
		"england": "Europe/London", "scotland": "Europe/London", "wales": "Europe/London", "northern ireland": "Europe/London",
		"ireland": "Europe/Dublin", "france": "Europe/Paris", "germany": "Europe/Berlin", "deutschland": "Europe/Berlin",
		"spain": "Europe/Madrid", "espana": "Europe/Madrid", "portugal": "Europe/Lisbon", "italy": "Europe/Rome", "italia": "Europe/Rome",
		"netherlands": "Europe/Amsterdam", "holland": "Europe/Amsterdam", "belgium": "Europe/Brussels", "luxembourg": "Europe/Luxembourg",
		"switzerland": "Europe/Zurich", "austria": "Europe/Vienna", "sweden": "Europe/Stockholm", "norway": "Europe/Oslo",
		"denmark": "Europe/Copenhagen", "finland": "Europe/Helsinki", "iceland": "Atlantic/Reykjavik", "poland": "Europe/Warsaw",
		"czechia": "Europe/Prague", "czech republic": "Europe/Prague", "slovakia": "Europe/Bratislava", "hungary": "Europe/Budapest",
		"romania": "Europe/Bucharest", "bulgaria": "Europe/Sofia", "greece": "Europe/Athens", "croatia": "Europe/Zagreb",
		"serbia": "Europe/Belgrade", "ukraine": "Europe/Kyiv", "russia": "Europe/Moscow", "turkey": "Europe/Istanbul", "turkiye": "Europe/Istanbul",
		"morocco": "Africa/Casablanca", "algeria": "Africa/Algiers", "tunisia": "Africa/Tunis", "egypt": "Africa/Cairo",
		"nigeria": "Africa/Lagos", "ghana": "Africa/Accra", "kenya": "Africa/Nairobi", "ethiopia": "Africa/Addis_Ababa",
		"tanzania": "Africa/Dar_es_Salaam", "south africa": "Africa/Johannesburg",
		"israel": "Asia/Jerusalem", "palestine": "Asia/Hebron", "lebanon": "Asia/Beirut", "jordan": "Asia/Amman",
		"saudi arabia": "Asia/Riyadh", "united arab emirates": "Asia/Dubai", "uae": "Asia/Dubai", "qatar": "Asia/Qatar",
		"kuwait": "Asia/Kuwait", "bahrain": "Asia/Bahrain", "oman": "Asia/Muscat", "iraq": "Asia/Baghdad", "iran": "Asia/Tehran",
		"afghanistan": "Asia/Kabul", "pakistan": "Asia/Karachi", "india": "Asia/Kolkata", "bharat": "Asia/Kolkata",
		"nepal": "Asia/Kathmandu", "bangladesh": "Asia/Dhaka", "sri lanka": "Asia/Colombo", "myanmar": "Asia/Yangon", "burma": "Asia/Yangon",
		"thailand": "Asia/Bangkok", "cambodia": "Asia/Phnom_Penh", "vietnam": "Asia/Ho_Chi_Minh", "laos": "Asia/Vientiane",
		"malaysia": "Asia/Kuala_Lumpur", "singapore": "Asia/Singapore", "indonesia": "Asia/Jakarta", "philippines": "Asia/Manila",
		"china": "Asia/Shanghai", "prc": "Asia/Shanghai", "hong kong": "Asia/Hong_Kong", "macau": "Asia/Macau", "taiwan": "Asia/Taipei",
		"mongolia": "Asia/Ulaanbaatar", "japan": "Asia/Tokyo", "nippon": "Asia/Tokyo", "south korea": "Asia/Seoul", "korea": "Asia/Seoul",
		"north korea": "Asia/Pyongyang", "kazakhstan": "Asia/Almaty", "uzbekistan": "Asia/Tashkent", "georgia country": "Asia/Tbilisi",
		"armenia": "Asia/Yerevan", "azerbaijan": "Asia/Baku",
		"australia": "Australia/Sydney", "new zealand": "Pacific/Auckland", "fiji": "Pacific/Fiji", "papua new guinea": "Pacific/Port_Moresby",
		"guam": "Pacific/Guam", "samoa": "Pacific/Apia", "tonga": "Pacific/Tongatapu",
		"brazil": "America/Sao_Paulo", "brasil": "America/Sao_Paulo", "argentina": "America/Argentina/Buenos_Aires",
		"chile": "America/Santiago", "colombia": "America/Bogota", "peru": "America/Lima", "venezuela": "America/Caracas",
		"ecuador": "America/Guayaquil", "bolivia": "America/La_Paz", "paraguay": "America/Asuncion", "uruguay": "America/Montevideo",
		"cuba": "America/Havana", "jamaica": "America/Jamaica", "haiti": "America/Port-au-Prince", "dominican republic": "America/Santo_Domingo",
		"puerto rico": "America/Puerto_Rico", "panama": "America/Panama", "costa rica": "America/Costa_Rica", "guatemala": "America/Guatemala",
		"honduras": "America/Tegucigalpa", "el salvador": "America/El_Salvador", "nicaragua": "America/Managua"
	};

	var CITY_ZONE = {
		// United States
		"new york city": "America/New_York", "nyc": "America/New_York", "manhattan": "America/New_York", "brooklyn": "America/New_York",
		"boston": "America/New_York", "washington": "America/New_York", "washington dc": "America/New_York", "dc": "America/New_York",
		"philadelphia": "America/New_York", "philly": "America/New_York", "pittsburgh": "America/New_York", "atlanta": "America/New_York",
		"miami": "America/New_York", "orlando": "America/New_York", "tampa": "America/New_York", "jacksonville": "America/New_York",
		"charlotte": "America/New_York", "raleigh": "America/New_York", "baltimore": "America/New_York", "richmond va": "America/New_York",
		"cleveland": "America/New_York", "columbus": "America/New_York", "cincinnati": "America/New_York", "buffalo": "America/New_York",
		"newark": "America/New_York", "boston ma": "America/New_York",
		"chicago": "America/Chicago", "houston": "America/Chicago", "dallas": "America/Chicago", "austin": "America/Chicago",
		"san antonio": "America/Chicago", "fort worth": "America/Chicago", "nashville": "America/Chicago", "memphis": "America/Chicago",
		"new orleans": "America/Chicago", "kansas city": "America/Chicago", "st louis": "America/Chicago", "saint louis": "America/Chicago",
		"milwaukee": "America/Chicago", "minneapolis": "America/Chicago", "oklahoma city": "America/Chicago", "omaha": "America/Chicago",
		"denver": "America/Denver", "salt lake city": "America/Denver", "albuquerque": "America/Denver", "el paso": "America/Denver",
		"colorado springs": "America/Denver", "boise": "America/Boise",
		"phoenix": "America/Phoenix", "tucson": "America/Phoenix", "scottsdale": "America/Phoenix", "mesa": "America/Phoenix",
		"los angeles": "America/Los_Angeles", "la": "America/Los_Angeles", "hollywood": "America/Los_Angeles",
		"san francisco": "America/Los_Angeles", "sf": "America/Los_Angeles", "bay area": "America/Los_Angeles",
		"san diego": "America/Los_Angeles", "san jose": "America/Los_Angeles", "sacramento": "America/Los_Angeles",
		"seattle": "America/Los_Angeles", "portland": "America/Los_Angeles", "las vegas": "America/Los_Angeles", "vegas": "America/Los_Angeles",
		"oakland": "America/Los_Angeles", "long beach": "America/Los_Angeles", "fresno": "America/Los_Angeles", "silicon valley": "America/Los_Angeles",
		"honolulu": "Pacific/Honolulu", "hawaii": "Pacific/Honolulu", "anchorage": "America/Anchorage", "alaska": "America/Anchorage",
		// Canada
		"toronto": "America/Toronto", "ottawa": "America/Toronto", "montreal": "America/Toronto", "quebec": "America/Toronto",
		"quebec city": "America/Toronto", "hamilton": "America/Toronto", "mississauga": "America/Toronto", "kitchener": "America/Toronto",
		"winnipeg": "America/Winnipeg", "regina": "America/Regina", "saskatoon": "America/Regina",
		"calgary": "America/Edmonton", "edmonton": "America/Edmonton", "vancouver": "America/Vancouver", "victoria": "America/Vancouver",
		"surrey": "America/Vancouver", "richmond bc": "America/Vancouver", "burnaby": "America/Vancouver", "kelowna": "America/Vancouver",
		"halifax": "America/Halifax", "st johns": "America/St_Johns",
		// UK / Ireland
		"london": "Europe/London", "manchester": "Europe/London", "birmingham": "Europe/London", "leeds": "Europe/London",
		"glasgow": "Europe/London", "edinburgh": "Europe/London", "liverpool": "Europe/London", "bristol": "Europe/London",
		"sheffield": "Europe/London", "cardiff": "Europe/London", "belfast": "Europe/London", "dublin": "Europe/Dublin", "cork": "Europe/Dublin",
		// Germany / Austria / Switzerland
		"berlin": "Europe/Berlin", "munich": "Europe/Berlin", "munchen": "Europe/Berlin", "frankfurt": "Europe/Berlin",
		"hamburg": "Europe/Berlin", "cologne": "Europe/Berlin", "koln": "Europe/Berlin", "stuttgart": "Europe/Berlin",
		"dusseldorf": "Europe/Berlin", "leipzig": "Europe/Berlin", "dortmund": "Europe/Berlin",
		"vienna": "Europe/Vienna", "wien": "Europe/Vienna", "salzburg": "Europe/Vienna", "graz": "Europe/Vienna",
		"zurich": "Europe/Zurich", "geneva": "Europe/Zurich", "basel": "Europe/Zurich", "bern": "Europe/Zurich", "lausanne": "Europe/Zurich",
		// France
		"paris": "Europe/Paris", "marseille": "Europe/Paris", "lyon": "Europe/Paris", "toulouse": "Europe/Paris",
		"nice": "Europe/Paris", "bordeaux": "Europe/Paris", "nantes": "Europe/Paris", "strasbourg": "Europe/Paris", "lille": "Europe/Paris",
		// Iberia / Italy
		"madrid": "Europe/Madrid", "barcelona": "Europe/Madrid", "valencia": "Europe/Madrid", "seville": "Europe/Madrid",
		"sevilla": "Europe/Madrid", "bilbao": "Europe/Madrid", "malaga": "Europe/Madrid", "lisbon": "Europe/Lisbon", "porto": "Europe/Lisbon",
		"rome": "Europe/Rome", "roma": "Europe/Rome", "milan": "Europe/Rome", "milano": "Europe/Rome", "naples": "Europe/Rome",
		"turin": "Europe/Rome", "florence": "Europe/Rome", "venice": "Europe/Rome", "bologna": "Europe/Rome", "palermo": "Europe/Rome",
		// Benelux / Nordics / Eastern Europe
		"amsterdam": "Europe/Amsterdam", "rotterdam": "Europe/Amsterdam", "the hague": "Europe/Amsterdam", "utrecht": "Europe/Amsterdam",
		"eindhoven": "Europe/Amsterdam", "brussels": "Europe/Brussels", "antwerp": "Europe/Brussels", "ghent": "Europe/Brussels",
		"stockholm": "Europe/Stockholm", "gothenburg": "Europe/Stockholm", "malmo": "Europe/Stockholm", "oslo": "Europe/Oslo",
		"bergen": "Europe/Oslo", "copenhagen": "Europe/Copenhagen", "helsinki": "Europe/Helsinki", "reykjavik": "Atlantic/Reykjavik",
		"warsaw": "Europe/Warsaw", "krakow": "Europe/Warsaw", "cracow": "Europe/Warsaw", "prague": "Europe/Prague", "praha": "Europe/Prague",
		"budapest": "Europe/Budapest", "bucharest": "Europe/Bucharest", "sofia": "Europe/Sofia", "athens": "Europe/Athens",
		"thessaloniki": "Europe/Athens", "zagreb": "Europe/Zagreb", "belgrade": "Europe/Belgrade",
		"istanbul": "Europe/Istanbul", "ankara": "Europe/Istanbul", "izmir": "Europe/Istanbul",
		"moscow": "Europe/Moscow", "saint petersburg": "Europe/Moscow", "st petersburg": "Europe/Moscow",
		"kyiv": "Europe/Kyiv", "kiev": "Europe/Kyiv",
		// Middle East / Africa
		"dubai": "Asia/Dubai", "abu dhabi": "Asia/Dubai", "sharjah": "Asia/Dubai", "doha": "Asia/Qatar",
		"riyadh": "Asia/Riyadh", "jeddah": "Asia/Riyadh", "mecca": "Asia/Riyadh", "kuwait city": "Asia/Kuwait",
		"tel aviv": "Asia/Jerusalem", "jerusalem": "Asia/Jerusalem", "tehran": "Asia/Tehran", "baghdad": "Asia/Baghdad",
		"beirut": "Asia/Beirut", "amman": "Asia/Amman", "cairo": "Africa/Cairo", "alexandria": "Africa/Cairo",
		"casablanca": "Africa/Casablanca", "marrakech": "Africa/Casablanca", "rabat": "Africa/Casablanca", "algiers": "Africa/Algiers",
		"lagos": "Africa/Lagos", "abuja": "Africa/Lagos", "accra": "Africa/Accra", "nairobi": "Africa/Nairobi",
		"cape town": "Africa/Johannesburg", "johannesburg": "Africa/Johannesburg", "joburg": "Africa/Johannesburg",
		"durban": "Africa/Johannesburg", "pretoria": "Africa/Johannesburg", "addis ababa": "Africa/Addis_Ababa",
		// South Asia
		"delhi": "Asia/Kolkata", "new delhi": "Asia/Kolkata", "mumbai": "Asia/Kolkata", "bombay": "Asia/Kolkata",
		"bangalore": "Asia/Kolkata", "bengaluru": "Asia/Kolkata", "kolkata": "Asia/Kolkata", "calcutta": "Asia/Kolkata",
		"chennai": "Asia/Kolkata", "madras": "Asia/Kolkata", "hyderabad": "Asia/Kolkata", "pune": "Asia/Kolkata",
		"ahmedabad": "Asia/Kolkata", "jaipur": "Asia/Kolkata", "goa": "Asia/Kolkata", "kerala": "Asia/Kolkata",
		"karachi": "Asia/Karachi", "lahore": "Asia/Karachi", "islamabad": "Asia/Karachi", "dhaka": "Asia/Dhaka",
		"colombo": "Asia/Colombo", "kathmandu": "Asia/Kathmandu",
		// SE / East Asia
		"bangkok": "Asia/Bangkok", "phuket": "Asia/Bangkok", "chiang mai": "Asia/Bangkok", "hanoi": "Asia/Ho_Chi_Minh",
		"ho chi minh city": "Asia/Ho_Chi_Minh", "saigon": "Asia/Ho_Chi_Minh", "jakarta": "Asia/Jakarta", "bali": "Asia/Makassar",
		"denpasar": "Asia/Makassar", "kuala lumpur": "Asia/Kuala_Lumpur", "manila": "Asia/Manila", "cebu": "Asia/Manila",
		"beijing": "Asia/Shanghai", "peking": "Asia/Shanghai", "shanghai": "Asia/Shanghai", "shenzhen": "Asia/Shanghai",
		"guangzhou": "Asia/Shanghai", "canton": "Asia/Shanghai", "chengdu": "Asia/Shanghai", "wuhan": "Asia/Shanghai",
		"taipei": "Asia/Taipei", "seoul": "Asia/Seoul", "busan": "Asia/Seoul", "incheon": "Asia/Seoul",
		"tokyo": "Asia/Tokyo", "osaka": "Asia/Tokyo", "kyoto": "Asia/Tokyo", "yokohama": "Asia/Tokyo",
		"nagoya": "Asia/Tokyo", "sapporo": "Asia/Tokyo", "fukuoka": "Asia/Tokyo",
		// Oceania
		"sydney": "Australia/Sydney", "canberra": "Australia/Sydney", "newcastle au": "Australia/Sydney",
		"melbourne": "Australia/Melbourne", "brisbane": "Australia/Brisbane", "gold coast": "Australia/Brisbane",
		"perth": "Australia/Perth", "adelaide": "Australia/Adelaide", "darwin": "Australia/Darwin", "hobart": "Australia/Hobart",
		"auckland": "Pacific/Auckland", "wellington": "Pacific/Auckland", "christchurch": "Pacific/Auckland", "suva": "Pacific/Fiji",
		// Latin America
		"mexico city": "America/Mexico_City", "guadalajara": "America/Mexico_City", "monterrey": "America/Monterrey",
		"cancun": "America/Cancun", "tijuana": "America/Tijuana", "sao paulo": "America/Sao_Paulo",
		"rio de janeiro": "America/Sao_Paulo", "rio": "America/Sao_Paulo", "brasilia": "America/Sao_Paulo",
		"buenos aires": "America/Argentina/Buenos_Aires", "cordoba": "America/Argentina/Cordoba",
		"santiago": "America/Santiago", "bogota": "America/Bogota", "medellin": "America/Bogota", "lima": "America/Lima",
		"caracas": "America/Caracas", "quito": "America/Guayaquil", "guayaquil": "America/Guayaquil",
		"montevideo": "America/Montevideo", "la paz": "America/La_Paz", "asuncion": "America/Asuncion",
		"havana": "America/Havana", "panama city": "America/Panama", "san juan": "America/Puerto_Rico"
	};

	var STATE_ZONE = {
		"alabama": "America/Chicago", "arizona": "America/Phoenix", "arkansas": "America/Chicago",
		"california": "America/Los_Angeles", "colorado": "America/Denver", "connecticut": "America/New_York",
		"delaware": "America/New_York", "florida": "America/New_York", "georgia": "America/New_York",
		"idaho": "America/Boise", "illinois": "America/Chicago", "indiana": "America/Indiana/Indianapolis",
		"iowa": "America/Chicago", "kansas": "America/Chicago", "kentucky": "America/New_York",
		"louisiana": "America/Chicago", "maine": "America/New_York", "maryland": "America/New_York",
		"massachusetts": "America/New_York", "michigan": "America/Detroit", "minnesota": "America/Chicago",
		"mississippi": "America/Chicago", "missouri": "America/Chicago", "montana": "America/Denver",
		"nebraska": "America/Chicago", "nevada": "America/Los_Angeles", "new hampshire": "America/New_York",
		"new jersey": "America/New_York", "new mexico": "America/Denver", "new york state": "America/New_York",
		"north carolina": "America/New_York", "north dakota": "America/Chicago", "ohio": "America/New_York",
		"oklahoma": "America/Chicago", "oregon": "America/Los_Angeles", "pennsylvania": "America/New_York",
		"rhode island": "America/New_York", "south carolina": "America/New_York", "south dakota": "America/Chicago",
		"tennessee": "America/Chicago", "texas": "America/Chicago", "utah": "America/Denver",
		"vermont": "America/New_York", "virginia": "America/New_York", "washington state": "America/Los_Angeles",
		"west virginia": "America/New_York", "wisconsin": "America/Chicago", "wyoming": "America/Denver"
	};

	var ABBR_ZONE = {
		"pst": "America/Los_Angeles", "pdt": "America/Los_Angeles", "pt": "America/Los_Angeles",
		"mst": "America/Denver", "mdt": "America/Denver", "mt": "America/Denver",
		"cst": "America/Chicago", "cdt": "America/Chicago",
		"est": "America/New_York", "edt": "America/New_York", "et": "America/New_York",
		"akst": "America/Anchorage", "akdt": "America/Anchorage", "hst": "Pacific/Honolulu",
		"gmt": "UTC", "utc": "UTC", "zulu": "UTC", "coordinated universal time": "UTC",
		"bst": "Europe/London", "wet": "Europe/Lisbon", "cet": "Europe/Paris", "cest": "Europe/Paris",
		"eet": "Europe/Athens", "eest": "Europe/Athens", "msk": "Europe/Moscow",
		"ist": "Asia/Kolkata", "gst": "Asia/Dubai", "pkt": "Asia/Karachi", "bst bangladesh": "Asia/Dhaka",
		"ict": "Asia/Bangkok", "sgt": "Asia/Singapore", "hkt": "Asia/Hong_Kong", "cst china": "Asia/Shanghai",
		"jst": "Asia/Tokyo", "kst": "Asia/Seoul",
		"aest": "Australia/Sydney", "aedt": "Australia/Sydney", "acst": "Australia/Adelaide",
		"awst": "Australia/Perth", "nzst": "Pacific/Auckland", "nzdt": "Pacific/Auckland"
	};

	function normTerm(s) {
		return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
			.replace(/[._\/]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
	}

	var _searchIndex = null;
	function searchIndex() {
		if (_searchIndex) return _searchIndex;
		var m = Object.create(null);
		function add(term, zone) {
			var k = normTerm(term);
			if (!k || !zone) return;
			var a = m[k] || (m[k] = []);
			if (a.indexOf(zone) === -1) a.push(zone);
		}
		allZones().forEach(function (z) {
			add(cityOf(z), z);
			add(z.replace(/[_\/]/g, " "), z);
			var seg = z.split("/");
			if (seg.length > 2) add(seg[1], z);
		});
		[COUNTRY_ZONE, CITY_ZONE, STATE_ZONE, ABBR_ZONE].forEach(function (map) {
			Object.keys(map).forEach(function (k) { add(k, map[k]); });
		});
		_searchIndex = m;
		return m;
	}

	// -> [{zone, via, already}] best matches for a typed query ("" = popular list)
	function searchZones(query, opts) {
		opts = opts || {};
		var limit = opts.limit || 8;
		var exclude = opts.exclude || {};
		var nq = normTerm(query);
		var best = Object.create(null);
		function consider(zone, score, via) {
			if (!zone) return;
			var cur = best[zone];
			if (!cur || score > cur.score) best[zone] = { score: score, via: via };
		}
		if (!nq) {
			POPULAR.forEach(function (z, i) { if (!exclude[z]) consider(z, 1000 - i, null); });
		} else {
			var m = searchIndex();
			Object.keys(m).forEach(function (k) {
				var s = 0;
				if (k === nq) s = 1000;
				else if (k.indexOf(nq) === 0) s = 700 - k.length;
				else if ((" " + k).indexOf(" " + nq) !== -1) s = 500 - k.length;
				else if (k.length >= 3 && (nq + " ").indexOf(k + " ") === 0) s = 400 - k.length; // "paris, france"
				else if (nq.length >= 3 && k.indexOf(nq) !== -1) s = 250 - k.length;
				if (s > 0) m[k].forEach(function (z) { consider(z, s, k); });
			});
			allZones().forEach(function (z) {
				var nz = normTerm(z);
				if (nz.indexOf(nq) !== -1) consider(z, nz.indexOf(nq) === 0 ? 650 : 180, null);
			});
		}
		return Object.keys(best).map(function (z) {
			return { zone: z, score: best[z].score, via: best[z].via, already: !!exclude[z] };
		}).sort(function (a, b) {
			if (a.already !== b.already) return a.already ? 1 : -1;   // "already added" sink to the bottom
			if (b.score !== a.score) return b.score - a.score;
			var pa = POPULAR.indexOf(a.zone), pb = POPULAR.indexOf(b.zone);
			pa = pa < 0 ? 999 : pa; pb = pb < 0 ? 999 : pb;
			if (pa !== pb) return pa - pb;
			return a.zone < b.zone ? -1 : 1;
		}).slice(0, limit);
	}

	/* ---- zone maths ---------------------------------------------------- */

	function isValidZone(z) {
		if (!z) return false;
		try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; }
		catch (e) { return false; }
	}

	function allZones() {
		try {
			if (typeof Intl.supportedValuesOf === "function") {
				var v = Intl.supportedValuesOf("timeZone");
				if (v && v.length) return v.indexOf("UTC") === -1 ? ["UTC"].concat(v) : v;
			}
		} catch (e) {}
		return FALLBACK_ZONES.slice().sort();
	}

	// minutes that `timeZone` is ahead of UTC at `date`
	function offsetMin(timeZone, date) {
		var dtf = new Intl.DateTimeFormat("en-US", {
			timeZone: timeZone, hourCycle: "h23",
			year: "numeric", month: "2-digit", day: "2-digit",
			hour: "2-digit", minute: "2-digit", second: "2-digit"
		});
		var p = {};
		dtf.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
		var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
		return Math.round((asUTC - date.getTime()) / 60000);
	}

	// wall-clock (y,mo,d,h,mi) in timeZone -> the UTC instant it refers to
	function wallToInstant(y, mo, d, h, mi, timeZone) {
		var guess = Date.UTC(y, mo - 1, d, h, mi, 0);
		var o1 = offsetMin(timeZone, new Date(guess));
		var t = guess - o1 * 60000;
		var o2 = offsetMin(timeZone, new Date(t));
		if (o2 !== o1) t = guess - o2 * 60000;
		return new Date(t);
	}

	function fmt(timeZone, instant, opts) {
		opts = opts || {};
		opts.timeZone = timeZone;
		return new Intl.DateTimeFormat("en-US", opts).format(instant);
	}
	function clockStr(timeZone, instant) {
		return fmt(timeZone, instant, { hour: "numeric", minute: "2-digit", hour12: true });
	}
	function dateStr(timeZone, instant) {
		return fmt(timeZone, instant, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
	}
	function ymd(timeZone, instant) {
		// en-CA renders ISO-ish YYYY-MM-DD
		var p = {};
		new Intl.DateTimeFormat("en-CA", { timeZone: timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
			.formatToParts(instant).forEach(function (x) { p[x.type] = x.value; });
		return p.year + "-" + p.month + "-" + p.day;
	}
	function dayDelta(a, b) {
		return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
	}
	function zoneName(timeZone, instant, style) {
		try {
			var part = new Intl.DateTimeFormat("en-US", { timeZone: timeZone, timeZoneName: style, hour: "numeric" })
				.formatToParts(instant).find(function (x) { return x.type === "timeZoneName"; });
			return part ? part.value : "";
		} catch (e) { return ""; }
	}
	function offsetStr(timeZone, instant) {
		var m = offsetMin(timeZone, instant);
		var sign = m >= 0 ? "+" : "−";
		m = Math.abs(m);
		var hh = Math.floor(m / 60), mm = m % 60;
		return "UTC" + sign + hh + (mm ? ":" + String(mm).padStart(2, "0") : "");
	}

	function cityOf(z) {
		if (z === "UTC") return "UTC";
		var seg = z.split("/");
		return seg[seg.length - 1].replace(/_/g, " ");
	}
	function regionOf(z) {
		if (z === "UTC") return "Coordinated Universal Time";
		var seg = z.split("/");
		return seg.slice(0, -1).join(" · ").replace(/_/g, " ");
	}
	// text shown in the "from" input for the selected zone
	function fromLabel(z) {
		if (z === HOME) return "Richmond / Vancouver, BC (Pacific Time)";
		if (z === "UTC") return "UTC (Coordinated Universal Time)";
		var long = zoneName(z, new Date(), "long");
		return cityOf(z) + (long ? " (" + long + ")" : "");
	}
	// short city name for a result row
	function comboLabel(z) {
		if (z === HOME) return "Richmond / Vancouver, BC";
		if (z === "UTC") return "UTC";
		return cityOf(z);
	}
	// secondary line for a result row: region + current offset + abbr/long name
	function comboMeta(z) {
		if (z === "UTC") return "Coordinated Universal Time · UTC±0";
		var now = new Date();
		var bits = [regionOf(z), offsetStr(z, now)];
		var abbr = zoneName(z, now, "short");
		var long = zoneName(z, now, "long");
		if (abbr && !/^(GMT|UTC)[+−-]?/.test(abbr)) bits.push(abbr);
		else if (long) bits.push(long);
		return bits.join(" · ");
	}
	// how the matched search term is shown ("Boston →"): acronyms upper-case, rest title-case
	var VIA_UPPER = {
		uk: 1, us: 1, usa: 1, uae: 1, nyc: 1, la: 1, sf: 1, dc: 1, prc: 1,
		pst: 1, pdt: 1, pt: 1, mst: 1, mdt: 1, mt: 1, cst: 1, cdt: 1, est: 1, edt: 1, et: 1,
		gmt: 1, utc: 1, bst: 1, wet: 1, cet: 1, cest: 1, eet: 1, eest: 1, msk: 1,
		ist: 1, gst: 1, pkt: 1, ict: 1, sgt: 1, hkt: 1, jst: 1, kst: 1,
		aest: 1, aedt: 1, acst: 1, awst: 1, nzst: 1, nzdt: 1, akst: 1, akdt: 1, hst: 1
	};
	function titleVia(s) {
		if (VIA_UPPER[s] || s.length <= 2) return s.toUpperCase();
		return s.replace(/\b([a-z])/g, function (_, c) { return c.toUpperCase(); });
	}

	/* ---- state ------------------------------------------------------- */

	var state = { date: "", time: "", from: HOME, targets: DEFAULT_TARGETS.slice() };

	function todayInZone(z) {
		var p = {};
		new Intl.DateTimeFormat("en-CA", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit" })
			.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
		return p.year + "-" + p.month + "-" + p.day;
	}
	// current wall-clock "HH:MM" in a zone -- the default the converter opens on
	function nowTimeInZone(z) {
		var p = {};
		new Intl.DateTimeFormat("en-GB", { timeZone: z, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
			.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
		return p.hour + ":" + p.minute;
	}

	function loadStore() {
		try {
			var s = JSON.parse(localStorage.getItem(STORE) || "null");
			if (s && Array.isArray(s.targets)) return s.targets.filter(isValidZone);
		} catch (e) {}
		return null;
	}
	function saveStore() {
		try { localStorage.setItem(STORE, JSON.stringify({ targets: state.targets })); } catch (e) {}
	}

	function readHash() {
		var h = (location.hash || "").replace(/^#/, "");
		if (!h) return null;
		var q = {};
		h.split("&").forEach(function (kv) {
			var i = kv.indexOf("=");
			if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
		});
		if (!q.t && !q.z && !q.f) return null;
		return q;
	}
	function applyHash(q) {
		if (/^\d{1,2}:\d{2}$/.test(q.t || "")) state.time = q.t;
		if (/^\d{4}-\d{2}-\d{2}$/.test(q.d || "")) state.date = q.d;
		if (isValidZone(q.f)) state.from = q.f;
		if (q.z) {
			var zs = q.z.split(",").map(function (x) { return x.trim(); }).filter(isValidZone);
			if (zs.length) state.targets = zs;
		}
	}
	function linkFor() {
		var base = location.href.split("#")[0];
		return base + "#t=" + encodeURIComponent(state.time) +
			"&d=" + encodeURIComponent(state.date) +
			"&f=" + encodeURIComponent(state.from) +
			"&z=" + encodeURIComponent(state.targets.join(","));
	}

	/* ---- rendering ------------------------------------------------- */

	var fromInput = $("tz-from"), addInput = $("tz-add"), list = $("tz-list");

	/* ---- searchable city/zone combobox --------------------------------- */

	function makeCombo(input, listEl, cfg) {
		var open = false, active = -1, rows = [];

		function close() {
			open = false; active = -1;
			listEl.classList.add("hide");
			input.setAttribute("aria-expanded", "false");
			input.removeAttribute("aria-activedescendant");
		}
		function draw() {
			rows = searchZones(input.value, { limit: 8, exclude: cfg.exclude ? cfg.exclude() : {} });
			if (!rows.length) {
				listEl.innerHTML = '<li class="tz__combo-empty">No match &mdash; try a city, country or &ldquo;UTC&rdquo;.</li>';
			} else {
				listEl.innerHTML = rows.map(function (r, i) {
					var city = comboLabel(r.zone), via = "";
					if (r.via && normTerm(r.via) !== normTerm(city) &&
						city.toLowerCase().indexOf(r.via) === -1) {
						via = '<span class="tz__combo-opt__via">' + titleVia(r.via) + ' &rarr;</span> ';
					}
					var tag = r.already ? ' <span class="tz__combo-opt__via">&middot; already shown</span>' : '';
					return '<li class="tz__combo-opt' + (r.already ? ' tz__combo-opt--dim' : '') + '" role="option"' +
						' id="' + listEl.id + '-o' + i + '" data-zone="' + r.zone + '"' +
						' data-already="' + (r.already ? 1 : 0) + '" aria-selected="' + (i === active) + '">' +
						via + '<span class="tz__combo-opt__city">' + city + '</span>' + tag +
						'<span class="tz__combo-opt__meta">' + comboMeta(r.zone) + '</span></li>';
				}).join("");
			}
			listEl.classList.remove("hide");
			open = true;
			input.setAttribute("aria-expanded", "true");
		}
		function move(d) {
			if (!open) draw();
			if (!rows.length) return;
			active = (active + d + rows.length) % rows.length;
			Array.prototype.forEach.call(listEl.children, function (li, i) {
				if (li.setAttribute) li.setAttribute("aria-selected", i === active);
				if (i === active && li.scrollIntoView) li.scrollIntoView({ block: "nearest" });
			});
			input.setAttribute("aria-activedescendant", listEl.id + "-o" + active);
		}
		function pick(zone, already) {
			if (!zone || already) return;
			close();
			input.blur();          // so render() can refill the "from" field with the tidy label
			cfg.onPick(zone);
		}

		input.addEventListener("focus", function () { draw(); if (input.value) input.select(); });
		input.addEventListener("input", function () { active = -1; draw(); });
		input.addEventListener("keydown", function (e) {
			if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
			else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
			else if (e.key === "Enter") {
				if (open && rows.length) {
					e.preventDefault();
					var r = rows[active] || rows.filter(function (x) { return !x.already; })[0];
					if (r) pick(r.zone, r.already);
				}
			} else if (e.key === "Escape") { close(); }
		});
		listEl.addEventListener("pointerdown", function (e) {
			var li = e.target.closest ? e.target.closest("[data-zone]") : null;
			if (li) { e.preventDefault(); pick(li.getAttribute("data-zone"), li.getAttribute("data-already") === "1"); }
		});
		input.addEventListener("blur", function () {
			setTimeout(function () { if (open) close(); if (cfg.onBlur) cfg.onBlur(); }, 120);
		});

		return {
			close: close,
			topMatch: function () {
				return searchZones(input.value, { limit: 8, exclude: cfg.exclude ? cfg.exclude() : {} })
					.filter(function (r) { return !r.already; })[0];
			}
		};
	}

	function usedByTargets() {
		var e = {};
		e[state.from] = 1;
		state.targets.forEach(function (z) { e[z] = 1; });
		return e;
	}

	var fromCombo = makeCombo(fromInput, $("tz-from-list"), {
		onPick: function (z) {
			if (!isValidZone(z)) return;
			state.targets = state.targets.filter(function (t) { return t !== z; });
			state.from = z;
			commit();
		},
		onBlur: function () { fromInput.value = fromLabel(state.from); }
	});

	var addCombo = makeCombo(addInput, $("tz-add-list"), {
		exclude: usedByTargets,
		onPick: function (z) {
			if (isValidZone(z) && state.targets.indexOf(z) === -1 && z !== state.from) {
				state.targets.push(z);
				commit();
			}
			addInput.value = "";
		}
	});

	function card(z, instant, isHome) {
		var li = document.createElement("li");
		li.className = "tz__card" + (isHome ? " tz__card--home" : "");
		var delta = dayDelta(ymd(z, instant), state.date);
		var badge = "";
		if (delta !== 0) {
			var cls = delta > 0 ? "tz__card__daydiff--plus" : "tz__card__daydiff--minus";
			var txt = (delta > 0 ? "+" : "−") + Math.abs(delta) + " day" + (Math.abs(delta) > 1 ? "s" : "");
			badge = '<span class="tz__card__daydiff ' + cls + '">' + txt + "</span>";
		}
		var flag = FLAG[z] ? '<span class="tz__flag">' + FLAG[z] + "</span>" : "";
		var abbr = zoneName(z, instant, "short");
		var longNm = zoneName(z, instant, "long");
		var place = z === HOME ? "Richmond / Vancouver, BC" : cityOf(z);
		var metaBits;
		if (z === "UTC") {
			metaBits = ["Coordinated Universal Time · UTC±0"];
		} else {
			metaBits = [regionOf(z), offsetStr(z, instant)];
			// non-US zones often report "GMT+1" as the short name -- redundant with
			// the offset we already show, so only keep a real abbreviation (EDT, JST)
			if (abbr && !/^(GMT|UTC)[+−-]?/.test(abbr) && abbr !== place) metaBits.push(abbr);
			if (longNm && longNm !== abbr) metaBits.push(longNm);
		}

		li.innerHTML =
			'<div class="tz__card__main">' +
				'<div class="tz__card__place">' + flag + place + (isHome ? ' <span class="tz__card__daydiff">start</span>' : badge) + "</div>" +
				'<div class="tz__card__meta">' + metaBits.join(" · ") + "</div>" +
			"</div>" +
			'<div class="tz__card__time">' +
				'<div class="tz__card__clock">' + clockStr(z, instant) + "</div>" +
				'<div class="tz__card__date">' + dateStr(z, instant) + "</div>" +
			"</div>" +
			(isHome ? "" : '<button type="button" class="tz__remove" title="Remove" aria-label="Remove ' + place + '">×</button>');

		if (!isHome) {
			li.querySelector(".tz__remove").addEventListener("click", function () {
				state.targets = state.targets.filter(function (t) { return t !== z; });
				commit();
			});
		}
		return li;
	}

	function render() {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date)) state.date = todayInZone(state.from);
		if (!/^\d{1,2}:\d{2}$/.test(state.time)) state.time = nowTimeInZone(state.from);

		$("tz-date").value = state.date;
		$("tz-time").value = state.time.length === 4 ? "0" + state.time : state.time;
		if (document.activeElement !== fromInput) fromInput.value = fromLabel(state.from);

		var dp = state.date.split("-"), tp = state.time.split(":");
		var instant = wallToInstant(+dp[0], +dp[1], +dp[2], +tp[0], +tp[1], state.from);

		list.innerHTML = "";
		list.appendChild(card(state.from, instant, true));
		state.targets.forEach(function (z) { list.appendChild(card(z, instant, false)); });

		var fAbbr = zoneName(state.from, instant, "short");
		var fLong = zoneName(state.from, instant, "long");
		if (fAbbr && /^(GMT|UTC)[+−-]?/.test(fAbbr)) fAbbr = "";
		$("tz-from-note").textContent =
			(fLong ? fLong + " · " : "") + (fAbbr && fAbbr !== fLong ? fAbbr + " · " : "") +
			offsetStr(state.from, instant) + " · " +
			fmt(state.from, instant, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
			", " + clockStr(state.from, instant);

		// keep the shareable-link box current, but never touch the address bar --
		// the home URL stays a clean /timezone; a #hash link is only produced when
		// the visitor clicks "Copy shareable link" (and honoured when one is opened).
		$("tz-link").value = linkFor();
		saveStore();
	}

	function commit() { render(); }

	/* ---- events --------------------------------------------------- */

	$("tz-date").addEventListener("change", function () { state.date = this.value || state.date; commit(); });
	$("tz-time").addEventListener("change", function () { state.time = this.value || state.time; commit(); });

	$("tz-add-btn").addEventListener("click", function () {
		if (!addInput.value.trim()) { addInput.focus(); return; }
		var r = addCombo.topMatch();
		if (r) { state.targets.push(r.zone); addInput.value = ""; commit(); }
	});

	$("tz-now").addEventListener("click", function () {
		state.date = todayInZone(state.from);
		state.time = nowTimeInZone(state.from);
		commit();
	});

	$("tz-locate").addEventListener("click", function () {
		var z = "";
		try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
		if (!isValidZone(z)) {
			$("tz-from-note").textContent = "Could not read your device's time zone.";
			return;
		}
		state.targets = state.targets.filter(function (t) { return t !== z; });
		state.from = z;
		commit();
	});

	$("tz-reset").addEventListener("click", function () {
		state.from = HOME;
		state.date = todayInZone(HOME);
		state.time = nowTimeInZone(HOME);
		state.targets = (loadStore() || DEFAULT_TARGETS).slice();
		commit();
	});

	$("tz-copy").addEventListener("click", function () {
		var link = linkFor();
		$("tz-link").value = link;
		try { history.replaceState(null, "", link); } catch (e) {}   // only on explicit share
		function ok() {
			var c = $("tz-copied");
			c.classList.remove("hide");
			setTimeout(function () { c.classList.add("hide"); }, 1600);
		}
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(link).then(ok, function () { $("tz-link").select(); document.execCommand("copy"); ok(); });
		} else {
			$("tz-link").select();
			document.execCommand("copy");
			ok();
		}
	});

	window.addEventListener("hashchange", function () {
		var q = readHash();
		if (q) { applyHash(q); render(); }
	});

	/* ---- boot ---------------------------------------------------- */

	var hash = readHash();
	if (hash) {
		applyHash(hash);
	} else {
		var saved = loadStore();
		if (saved && saved.length) state.targets = saved;
	}
	// no hash -> open on "now" in the starting zone; a shared link keeps its own time
	if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date)) state.date = todayInZone(state.from);
	if (!/^\d{1,2}:\d{2}$/.test(state.time)) state.time = nowTimeInZone(state.from);

	render();
})();
