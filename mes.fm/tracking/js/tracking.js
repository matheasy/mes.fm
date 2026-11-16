/* MES Package Tracker: tracking-number detection (pure; runs in node too: require('./tool_apps_src/tracking/lib.js')).
   detect(code)  -> {n, kind, info, carriers: [{id, name, url, conf, why}], check: true|false|null}
   extract(text) -> [{n, raw}] every tracking-looking number in a pasted text / scan / tracking link.
   Nothing here talks to a network: it only recognises the number and builds the carriers' own tracking links. */
(function (root) {
  "use strict";
  var T = {};

  // ---- carriers: id -> [name, link template ({n} = number; null = site has no link form), home page, country, colour]
  var C = {
    royalmail: ["Royal Mail", "https://www.royalmail.com/track-your-item#/tracking-results/{n}", "https://www.royalmail.com/track-your-item", "GB", "#da202a"],
    parcelforce: ["Parcelforce", "https://www.parcelforce.com/track-trace?trackNumber={n}", "https://www.parcelforce.com/track-trace", "GB", "#c8102e"],
    evri: ["Evri", "https://www.evri.com/track/parcel/{n}", "https://www.evri.com/track-a-parcel", "GB", "#007bc4"],
    yodel: ["Yodel", "https://www.yodel.co.uk/tracking/{n}", "https://www.yodel.co.uk/track", "GB", "#66b32e"],
    dpduk: ["DPD UK", "https://track.dpd.co.uk/parcels/{n}", "https://track.dpd.co.uk", "GB", "#dc0032"],
    usps: ["USPS", "https://tools.usps.com/go/TrackConfirmAction?tLabels={n}", "https://tools.usps.com/go/TrackConfirmAction", "US", "#333366"],
    ups: ["UPS", "https://www.ups.com/track?tracknum={n}", "https://www.ups.com/track", "", "#351c15"],
    fedex: ["FedEx", "https://www.fedex.com/fedextrack/?trknbr={n}", "https://www.fedex.com/fedextrack/", "", "#4d148c"],
    dhl: ["DHL Express", "https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}", "https://www.dhl.com/global-en/home/tracking.html", "", "#d40511"],
    dhlecom: ["DHL eCommerce", "https://www.dhl.com/global-en/home/tracking/tracking-ecommerce.html?submit=1&tracking-id={n}", "https://www.dhl.com/global-en/home/tracking.html", "", "#d40511"],
    dhlde: ["DHL Paket (Deutsche Post)", "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={n}", "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html", "DE", "#ffcc00"],
    amazon: ["Amazon Logistics", "https://track.amazon.com/tracking/{n}", "https://track.amazon.com/", "", "#ff9900"],
    ontrac: ["OnTrac", "https://www.ontrac.com/tracking/?number={n}", "https://www.ontrac.com/tracking/", "US", "#f26722"],
    canadapost: ["Canada Post", "https://www.canadapost-postescanada.ca/track-reperage/en#/details/{n}", "https://www.canadapost-postescanada.ca/track-reperage/en", "CA", "#e3192a"],
    purolator: ["Purolator", "https://www.purolator.com/en/shipping/tracker?pin={n}", "https://www.purolator.com/en/shipping/tracker", "CA", "#bd1a28"],
    canpar: ["Canpar", "https://www.canpar.com/en/tracking/track.htm?barcode={n}", "https://www.canpar.com/en/tracking/track.htm", "CA", "#0b4ea2"],
    auspost: ["Australia Post", "https://auspost.com.au/mypost/track/details/{n}", "https://auspost.com.au/mypost/track", "AU", "#dc1928"],
    nzpost: ["NZ Post", "https://www.nzpost.co.nz/tools/tracking?trackid={n}", "https://www.nzpost.co.nz/tools/tracking", "NZ", "#e4002b"],
    laposte: ["La Poste / Colissimo", "https://www.laposte.fr/outils/suivre-vos-envois?code={n}", "https://www.laposte.fr/outils/suivre-vos-envois", "FR", "#ffc700"],
    postnl: ["PostNL", "https://jouw.postnl.nl/track-and-trace/{n}", "https://www.postnl.nl/en/receiving/track-trace/", "NL", "#ff6200"],
    bpost: ["bpost", "https://track.bpost.cloud/btr/web/#/search?itemCode={n}&lang=en", "https://track.bpost.cloud/btr/web/", "BE", "#ef2637"],
    correos: ["Correos", "https://www.correos.es/es/en/tools/tracker/items/details?tracking-number={n}", "https://www.correos.es/es/en/tools/tracker/items", "ES", "#ffcd00"],
    posteit: ["Poste Italiane", "https://www.poste.it/cerca/index.html#/risultati-spedizioni/{n}", "https://www.poste.it/cerca/index.html", "IT", "#0047bb"],
    swisspost: ["Swiss Post", "https://service.post.ch/ekp-web/ui/entry/search/{n}", "https://service.post.ch/ekp-web/ui/entry", "CH", "#ffcc00"],
    austriapost: ["Austrian Post", "https://www.post.at/s/sendungsdetails?snr={n}", "https://www.post.at/s/sendungssuche", "AT", "#ffdc00"],
    postnord: ["PostNord", "https://www.postnord.se/en/our-tools/track-and-trace?shipmentId={n}", "https://www.postnord.se/en/our-tools/track-and-trace", "SE", "#00a0d6"],
    posten: ["Posten (Norway)", "https://sporing.posten.no/sporing/{n}", "https://sporing.posten.no/", "NO", "#e32d22"],
    anpost: ["An Post", "https://www.anpost.com/Post-Parcels/Track/History?item={n}", "https://www.anpost.com/Post-Parcels/Track", "IE", "#006a4d"],
    ctt: ["CTT (Portugal)", "https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects={n}", "https://www.ctt.pt/", "PT", "#e1001a"],
    polishpost: ["Poczta Polska", "https://emonitoring.poczta-polska.pl/?numer={n}", "https://emonitoring.poczta-polska.pl/", "PL", "#e30613"],
    gls: ["GLS", "https://gls-group.com/track/{n}", "https://gls-group.com/track", "", "#061ab1"],
    dpd: ["DPD", "https://tracking.dpd.de/status/en_US/parcel/{n}", "https://tracking.dpd.de/", "", "#dc0032"],
    japanpost: ["Japan Post", "https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1={n}&locale=en", "https://trackings.post.japanpost.jp/services/srv/search/?locale=en", "JP", "#cc0000"],
    koreapost: ["Korea Post", "https://service.epost.go.kr/trace.RetrieveEmsRigiTraceList.comm?POST_CODE={n}&displayHeader=N", "https://service.epost.go.kr/", "KR", "#e60012"],
    chinapost: ["China Post / EMS", null, "https://www.ems.com.cn/", "CN", "#006f3c"],
    cainiao: ["Cainiao (AliExpress)", "https://global.cainiao.com/newDetail.htm?mailNoList={n}", "https://global.cainiao.com/", "CN", "#ff6a00"],
    yunexpress: ["YunExpress", "https://www.yuntrack.com/parcelTracking?id={n}", "https://www.yuntrack.com/", "CN", "#1a5dab"],
    hkpost: ["Hongkong Post", "https://www.hongkongpost.hk/en/mail_tracking/index.html?trackcode={n}", "https://www.hongkongpost.hk/en/mail_tracking/index.html", "HK", "#006a4e"],
    singpost: ["SingPost", "https://www.singpost.com/track-items?trackingid={n}", "https://www.singpost.com/track-items", "SG", "#ee2737"],
    indiapost: ["India Post", null, "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx", "IN", "#c9252c"],
    vnpost: ["Vietnam Post", null, "https://vnpost.vn/", "VN", "#f5a800"],
    thaipost: ["Thailand Post", "https://track.thailandpost.co.th/?trackNumber={n}", "https://track.thailandpost.co.th/", "TH", "#e30613"],
    phlpost: ["PHLPost", null, "https://tracking.phlpost.gov.ph/", "PH", "#003893"],
    correios: ["Correios (Brazil)", null, "https://rastreamento.correios.com.br/app/index.php", "BR", "#ffcc00"],
    mexpost: ["Correos de México", null, "https://www.correosdemexico.gob.mx/SSLServicios/SeguimientoEnvio/Seguimiento.aspx", "MX", "#7a1a3a"],
    russianpost: ["Russian Post", "https://www.pochta.ru/tracking#{n}", "https://www.pochta.ru/tracking", "RU", "#0055a6"],
    ukrposhta: ["Ukrposhta", "https://track.ukrposhta.ua/tracking_UA.html?barcode={n}", "https://track.ukrposhta.ua/", "UA", "#ffcc00"],
    turkishpost: ["PTT (Türkiye)", "https://gonderitakip.ptt.gov.tr/Track/Verify?q={n}", "https://gonderitakip.ptt.gov.tr/", "TR", "#ffd400"],
    israelpost: ["Israel Post", "https://israelpost.co.il/en/itemtrace?itemcode={n}", "https://israelpost.co.il/en/itemtrace", "IL", "#e3001b"],
    sapo: ["South African Post", null, "https://www.postoffice.co.za/", "ZA", "#003b7b"],
    // universal trackers: work for most carriers in the world
    t17: ["17TRACK", "https://t.17track.net/en#nums={n}", "https://www.17track.net/", "*", "#ff6000"],
    parcelsapp: ["Parcels (parcelsapp.com)", "https://parcelsapp.com/en/tracking/{n}", "https://parcelsapp.com/", "*", "#2a7de1"],
    ship24: ["Ship24", "https://www.ship24.com/tracking?p={n}", "https://www.ship24.com/", "*", "#5b3df5"]
  };
  T.CARRIERS = C;
  T.UNIVERSAL = ["t17", "parcelsapp", "ship24"];

  // national post per S10 country code (the two letters at the end of LA717056590GB)
  var POST = {GB: ["royalmail", "parcelforce"], US: ["usps"], CA: ["canadapost"], AU: ["auspost"], NZ: ["nzpost"], DE: ["dhlde"], FR: ["laposte"], NL: ["postnl"],
    BE: ["bpost"], ES: ["correos"], IT: ["posteit"], CH: ["swisspost"], AT: ["austriapost"], SE: ["postnord"], DK: ["postnord"], FI: ["postnord"], NO: ["posten"], IE: ["anpost"],
    PT: ["ctt"], PL: ["polishpost"], JP: ["japanpost"], KR: ["koreapost"], CN: ["chinapost", "cainiao"], HK: ["hkpost"], SG: ["singpost"], IN: ["indiapost"], VN: ["vnpost"],
    TH: ["thaipost"], PH: ["phlpost"], BR: ["correios"], MX: ["mexpost"], RU: ["russianpost"], UA: ["ukrposhta"], TR: ["turkishpost"], IL: ["israelpost"], ZA: ["sapo"]};
  T.POST = POST;
  T.HOMES = Object.keys(POST);

  // S10 first letter = kind of item (UPU S10 standard)
  var S10KIND = {E: "EMS express mail", C: "Parcel post", R: "Registered letter", L: "Tracked letter / small packet", V: "Insured letter", U: "Untracked small packet (usually no scans)",
    H: "Tracked e-commerce packet", A: "Tracked small packet", B: "Tracked small packet", N: "Domestic tracked item", Q: "International reply coupon / special", Z: "Domestic item"};

  // ---- check digits
  T.s10Check = function (d8) {              // 8 serial digits -> check digit (UPU S10)
    var w = [8, 6, 4, 2, 3, 5, 9, 7], s = 0;
    for (var i = 0; i < 8; i++) s += (+d8[i]) * w[i];
    var c = 11 - (s % 11);
    return c === 10 ? 0 : c === 11 ? 5 : c;
  };
  T.upsCheck = function (code) {            // 1Z + 15 chars + check
    var body = code.slice(2, 17), s = 0;
    for (var i = 0; i < body.length; i++) {
      var ch = body[i], v = /\d/.test(ch) ? +ch : (ch.charCodeAt(0) - 63) % 10;
      s += (i % 2 === 1) ? v * 2 : v;
    }
    var c = (10 - (s % 10)) % 10;
    return c === +code[17];
  };
  T.mod10w31 = function (digits) {          // last digit = check; weights 3,1,3,1 from the right (USPS IMpb, FedEx Ground, SSCC)
    var s = 0, data = digits.slice(0, -1);
    for (var i = data.length - 1, k = 0; i >= 0; i--, k++) s += (+data[i]) * (k % 2 === 0 ? 3 : 1);
    return (10 - (s % 10)) % 10 === +digits[digits.length - 1];
  };
  T.fedex12 = function (digits) {           // FedEx Express 12 digits: weights 1,3,7 from the right, mod 11, mod 10
    var w = [1, 3, 7], s = 0, data = digits.slice(0, 11);
    for (var i = 10, k = 0; i >= 0; i--, k++) s += (+data[i]) * w[k % 3];
    return (s % 11) % 10 === +digits[11];
  };
  T.mod7 = function (digits) {              // DHL Express 10 digits
    return (+digits.slice(0, -1)) % 7 === +digits[digits.length - 1];
  };

  // ---- clean what was typed / scanned
  T.clean = function (s) {
    s = String(s || "").toUpperCase().replace(/[\s\-–—._/]+/g, "");
    // USPS barcodes start with 420 + ZIP (5 or 9 digits) before the 22-digit number
    var m = s.match(/^420(\d{5}|\d{9})(9\d{21})$/);
    if (m) s = m[2];
    return s.replace(/[^A-Z0-9]/g, "");
  };

  function L(id, conf, why) { return {id: id, conf: conf, why: why}; }

  // ---- the rules. Each returns {kind, info, check, list: [L(...)]} or null
  function rules(n) {
    var m, out = [];
    // UPU S10: XX 12345678 9 YY
    if ((m = n.match(/^([A-Z]{2})(\d{8})(\d)([A-Z]{2})$/))) {
      var ok = T.s10Check(m[2]) === +m[3], cc = m[4], k = S10KIND[m[1][0]] || "International postal item";
      var posts = POST[cc] || [];
      var list = posts.map(function (id, i) { return L(id, ok ? (i ? "likely" : "high") : "maybe", "Starts its journey with " + C[id][0] + " (country code " + cc + ")"); });
      return {kind: "s10", origin: cc, info: k + (cc === "XX" ? "" : " from country " + cc), check: ok, list: list, dest: true};
    }
    // UPS 1Z
    if (/^1Z[0-9A-Z]{16}$/.test(n)) { var u = T.upsCheck(n); return {kind: "ups", info: "UPS shipment", check: u, list: [L("ups", u ? "high" : "likely", "Every UPS number starts with 1Z")]}; }
    // Amazon
    if ((m = n.match(/^TB([ACM])\d{12}$/))) return {kind: "amazon", info: "Amazon Logistics" + (m[1] === "C" ? " (Canada)" : m[1] === "M" ? " (Mexico)" : ""), check: null, list: [L("amazon", "high", "Amazon's own delivery numbers start with TBA / TBC / TBM")]};
    // DHL Express waybill JJD...
    if (/^JJD\d{10,20}$/.test(n) || /^JVGL\d{10,20}$/.test(n)) return {kind: "dhl", info: "DHL Express piece", check: null, list: [L("dhl", "high", "JJD / JVGL numbers are DHL Express pieces")]};
    // DHL eCommerce GM / LX...
    if (/^GM\d{16,20}$/.test(n)) return {kind: "dhlecom", info: "DHL eCommerce", check: null, list: [L("dhlecom", "high", "GM + 16-20 digits is DHL eCommerce"), L("usps", "likely", "DHL eCommerce often hands over to USPS for the last mile")]};
    // Yodel JD + 16 digits
    if (/^JD\d{16}$/.test(n)) return {kind: "yodel", info: "Yodel parcel", check: null, list: [L("yodel", "high", "JD + 16 digits is Yodel's format")]};
    // OnTrac / LaserShip
    if (/^[CD]\d{14}$/.test(n) || /^1LS\d{12,15}$/.test(n) || /^LX\d{8,10}$/.test(n)) return {kind: "ontrac", info: "OnTrac (incl. former LaserShip)", check: null, list: [L("ontrac", "high", "OnTrac / LaserShip format")]};
    // YunExpress, Cainiao
    if (/^YT\d{16}$/.test(n)) return {kind: "yun", info: "YunExpress", check: null, list: [L("yunexpress", "high", "YT + 16 digits is YunExpress")]};
    if (/^(LP|CNG|CAINIAO)\d{8,20}$/.test(n) || /^LP\d{14}$/.test(n)) return {kind: "cainiao", info: "Cainiao / AliExpress", check: null, list: [L("cainiao", "high", "LP / CNG numbers come from Cainiao (AliExpress)")]};
    // Purolator letters
    if (/^[A-Z]{3}\d{9}$/.test(n)) return {kind: "purolator", info: "Purolator", check: null, list: [L("purolator", "likely", "3 letters + 9 digits is a Purolator format")]};
    // Evri (Hermes UK): 16 characters starting with H or T and digits/letters
    if (/^[HT][0-9A-Z]{15}$/.test(n) && /\d{6}/.test(n)) return {kind: "evri", info: "Evri (formerly Hermes)", check: null, list: [L("evri", "likely", "16 characters starting with H or T is Evri's format")]};

    if (!/^\d+$/.test(n)) return null;
    var len = n.length;
    // USPS 22 digits starting 9x / 20-digit / 26 / 30 / 34
    if (len === 22 && /^9[2-5]/.test(n)) { var c22 = T.mod10w31(n); return {kind: "usps", info: "USPS (Intelligent Mail package barcode)", check: c22, list: [L("usps", c22 ? "high" : "likely", "22 digits starting with 92-95 is USPS")]}; }
    if (len === 22 && /^96/.test(n)) return {kind: "fedex", info: "FedEx Ground (barcode form)", check: null, list: [L("fedex", "high", "22 digits starting with 96 is a FedEx Ground barcode"), L("usps", "maybe", "")]};
    if (len === 20 || len === 22 || len === 26 || len === 30) {
      var c = T.mod10w31(n);
      out.push(L("usps", c ? "likely" : "maybe", len + " digits fits USPS"));
      out.push(L("fedex", "maybe", len + " digits also fits FedEx Ground / SmartPost"));
      if (len === 20) out.push(L("dhlde", "maybe", "DHL Paket numbers can be 20 digits"));
      return {kind: "num", info: len + "-digit number", check: c || null, list: out};
    }
    if (len === 34) return {kind: "fedex", info: "FedEx barcode (the last 12-15 digits are the tracking number)", check: null, list: [L("fedex", "likely", "34-digit barcodes are FedEx")], alt: n.slice(-12)};
    if (len === 16) {
      out.push(L("canadapost", "likely", "Canada Post's own numbers are 16 digits"));
      out.push(L("evri", "maybe", "Evri numbers are also 16 characters"));
      return {kind: "num", info: "16-digit number", check: null, list: out};
    }
    if (len === 15) { var g = T.mod10w31(n); out.push(L("fedex", g ? "likely" : "maybe", "15 digits fits FedEx Ground")); return {kind: "num", info: "15-digit number", check: g || null, list: out}; }
    if (len === 14) { out.push(L("dpd", "likely", "14 digits is DPD's format")); out.push(L("dpduk", "likely", "DPD UK uses the same 14 digits")); out.push(L("fedex", "maybe", "")); return {kind: "num", info: "14-digit number", check: null, list: out}; }
    if (len === 12) {
      var f = T.fedex12(n);
      out.push(L("fedex", f ? "likely" : "maybe", "12 digits fits FedEx Express"));
      out.push(L("purolator", "maybe", "Purolator PINs are often 12 digits"));
      out.push(L("dhlde", "maybe", "DHL Paket numbers can be 12 digits"));
      out.push(L("gls", "maybe", "GLS uses 11-12 digits"));
      out.push(L("canadapost", "maybe", "Older Canada Post numbers are 12 digits"));
      return {kind: "num", info: "12-digit number", check: f || null, list: out};
    }
    if (len === 11) return {kind: "num", info: "11-digit number", check: null, list: [L("gls", "likely", "GLS uses 11 digits"), L("dhl", "maybe", "")]};
    if (len === 10) { var d = T.mod7(n); return {kind: "num", info: "10-digit number", check: d || null, list: [L("dhl", d ? "likely" : "maybe", "DHL Express waybills are 10 digits"), L("canpar", "maybe", "")]}; }
    if (len >= 8 && len <= 40) return {kind: "num", info: len + "-digit number", check: null, list: []};
    return null;
  }

  var RANK = {high: 3, likely: 2, maybe: 1};
  T.RANK = RANK;

  // url(id, n) -> the carrier's tracking link (or its home page when it has no link form)
  T.url = function (id, n) {
    var c = C[id]; if (!c) return "";
    return c[1] ? c[1].replace("{n}", encodeURIComponent(n)) : c[2];
  };
  T.direct = function (id) { return !!(C[id] && C[id][1]); };

  // detect(code, {home}) -> null when it does not look like a tracking number at all
  T.detect = function (code, opt) {
    opt = opt || {};
    var n = T.clean(code);
    if (n.length < 8 || n.length > 40) return null;
    var r = rules(n);
    if (!r) return null;
    var home = opt.home || "", seen = {}, list = [];
    r.list.forEach(function (x) { if (!seen[x.id]) { seen[x.id] = 1; list.push(x); } });
    // home-country boost: a local carrier that fits goes up a step; for S10 items the home post can also track it on arrival
    list.forEach(function (x) { if (home && C[x.id][3] === home && x.conf === "maybe") x.conf = "likely"; });
    if (r.dest && home && r.origin !== home) (POST[home] || []).slice(0, 1).forEach(function (id) {
      if (!seen[id]) { seen[id] = 1; list.push(L(id, "likely", "Takes over when it reaches your country (" + home + ")")); }
    });
    list.sort(function (a, b) { return RANK[b.conf] - RANK[a.conf]; });
    T.UNIVERSAL.forEach(function (id) { list.push(L(id, "any", "Universal tracker: checks hundreds of carriers")); });
    list.forEach(function (x) { x.name = C[x.id][0]; x.url = T.url(x.id, n); x.color = C[x.id][4]; x.direct = T.direct(x.id); });
    var best = list[0] && list[0].conf !== "any" ? list[0].conf : "unknown";
    return {n: n, kind: r.kind, info: r.info, origin: r.origin || "", check: r.check, conf: best, carriers: list, alt: r.alt || ""};
  };

  // a tracking link pasted / scanned: find the number inside it
  var PARAMS = ["tLabels", "qtc_tLabels1", "tracknum", "trknbr", "tracknumbers", "trackingNumber", "tracking_number", "trackNumber", "tracking-id", "trackingId", "trackid", "trackcode",
    "piececode", "pin", "barcode", "itemCode", "item", "code", "mailNoList", "mailNum", "number", "snr", "shipmentId", "reqCodeNo1", "POST_CODE", "nums", "p", "id", "n", "q"];
  T.fromUrl = function (s) {
    var u; try { u = new URL(String(s).trim()); } catch (e) { return ""; }
    if (!/^https?:$/.test(u.protocol)) return "";
    var hashQ = u.hash.indexOf("?") >= 0 ? new URLSearchParams(u.hash.slice(u.hash.indexOf("?") + 1)) : null;
    var hashP = u.hash.replace(/^#/, "").split(/[?&]/)[0];
    var tries = [];
    PARAMS.forEach(function (k) { var v = u.searchParams.get(k); if (v) tries.push(v); if (hashQ && hashQ.get(k)) tries.push(hashQ.get(k)); });
    if (/nums=/.test(hashP)) tries.push(hashP.split("nums=")[1]);
    tries = tries.concat(hashP.split("/").reverse(), u.pathname.split("/").reverse());
    for (var i = 0; i < tries.length; i++) {
      var parts = String(tries[i]).split(/[,;]/);
      for (var j = 0; j < parts.length; j++) { var d = T.detect(parts[j]); if (d && d.conf !== "unknown") return d.n; }
    }
    return "";
  };

  // extract(text) -> the tracking numbers found in a block of text (an email, a scan, a list)
  T.extract = function (text, opt) {
    opt = opt || {};
    text = String(text || "");
    var found = [], seen = {};
    function add(n, raw) { if (!seen[n]) { seen[n] = 1; found.push({n: n, raw: raw}); } }
    // links first
    (text.match(/https?:\/\/[^\s<>"']+/g) || []).forEach(function (u) { var n = T.fromUrl(u); if (n) add(n, u); });
    text = text.replace(/https?:\/\/[^\s<>"']+/g, " ");
    var lines = text.split(/\r?\n/);
    var single = lines.filter(function (l) { return l.trim(); }).length <= 1;
    lines.forEach(function (line) {
      // words joined by single spaces / dashes can be one number ("LA 717 056 590 GB", "9400 1118 9922 ...")
      var keyed = /track|parcel|package|shipment|waybill|consignment|awb|colis|suivi|sendung|envío|envio|paket|pin\b/i.test(line);
      var whole = line.replace(/[\s\-]/g, "");
      var words = []; line.replace(/[A-Za-z0-9]+/g, function (w, i) { words.push({w: w, i: i}); });
      var used = [];
      for (var a = 0; a < words.length; a++) {
        if (used[a]) continue;
        var best = null;
        for (var b = a, s = ""; b < words.length && b < a + 8; b++) {
          if (b > a) { var gap = line.slice(words[b - 1].i + words[b - 1].w.length, words[b].i); if (!/^[ \-]{1,2}$/.test(gap)) break; }
          s += words[b].w;
          if (s.length > 40) break;
          var d = T.detect(s, opt);
          if (!d) continue;
          var strong = d.conf === "high" || (d.check === true && (/[A-Z]/.test(d.n) || d.n.length >= 15)) || (d.conf === "likely" && /[A-Z]/.test(d.n));
          var keyOk = d.conf !== "unknown" && /^\d{10,}$/.test(d.n) && (keyed || d.n === whole.toUpperCase());
          if (strong || keyOk || (single && d.conf !== "unknown") || (single && words.length <= 8 && /^\d{8,}$/.test(d.n) && b === words.length - 1 && a === 0)) best = {d: d, b: b, strong: strong};
        }
        if (best) { add(best.d.n, line.trim()); for (var k = a; k <= best.b; k++) used[k] = 1; }
      }
    });
    return found;
  };

  // country of the browser (for the "your country" setting)
  T.guessHome = function (langs) {
    langs = langs || [];
    for (var i = 0; i < langs.length; i++) { var m = String(langs[i]).match(/-([A-Z]{2})$/i); if (m && POST[m[1].toUpperCase()]) return m[1].toUpperCase(); }
    return "";
  };

  // share links: ?n=A,B
  T.parseQuery = function (search) {
    var q = new URLSearchParams(search || "");
    var raw = (q.get("n") || q.get("q") || q.get("t") || "").split(/[,\s]+/).filter(Boolean);
    return raw.map(T.clean).filter(function (n) { return n.length >= 8 && n.length <= 40; }).slice(0, 30);
  };

  if (typeof module !== "undefined" && module.exports) module.exports = T;
  root.MESTrack = T;
})(typeof self !== "undefined" ? self : this);

/* MES Package Tracker page. Uses MESTrack (lib.js). Saved parcels: localStorage mes-tracking:v1 = {home, items:[{n, label, added, done, cid}], showDone} */
(function () {
  "use strict";
  var T = window.MESTrack, $ = function (id) { return document.getElementById(id); };
  var KEY = "mes-tracking:v1";
  var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
  var ZX_URL = "https://cdn.jsdelivr.net/npm/zxing-wasm@2.1.2/dist/iife/reader/index.js";
  var S = load();
  var current = [];   // numbers shown in the results

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
    if (!Array.isArray(s.items)) s.items = [];
    if (s.home === undefined) s.home = T.guessHome(navigator.languages || [navigator.language || ""]);
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  var cn = null; try { cn = new Intl.DisplayNames([navigator.language || "en"], {type: "region"}); } catch (e) {}
  function country(cc) { try { return (cn && cn.of(cc)) || cc; } catch (e) { return cc; } }
  function flag(cc) { return /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(127397 + cc.charCodeAt(0), 127397 + cc.charCodeAt(1)) : ""; }
  function group(n) { return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(n) ? n.slice(0, 2) + " " + n.slice(2, 5) + " " + n.slice(5, 8) + " " + n.slice(8, 11) + " " + n.slice(11) : n.replace(/(.{4})(?=.)/g, "$1 "); }
  var toastT;
  function toast(msg, html) { var t = $("tk-toast"); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3200); }
  function copy(text, done) {
    var fin = function () { toast(done || "Copied"); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(fin, fall); else fall();
    function fall() { var a = document.createElement("textarea"); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch (e) {} a.remove(); fin(); }
  }
  function status(msg, busy) { var s = $("tk-status"); s.hidden = !msg; s.className = "tk-status" + (busy ? " is-busy" : ""); s.textContent = msg || ""; }
  function savedItem(n) { for (var i = 0; i < S.items.length; i++) if (S.items[i].n === n) return S.items[i]; return null; }

  // ---- your country
  (function () {
    var ALIAS = {US: "usa america united states", GB: "uk britain england scotland wales great britain", AE: "uae emirates dubai", KR: "korea", NL: "holland", CZ: "czechia", TR: "turkey", CH: "swiss", DE: "deutschland", ES: "espana", HK: "hongkong", TW: "taiwan", RU: "russia", VN: "viet nam"};
    var sel = $("tk-home"), homes = T.HOMES.slice().sort(function (a, b) { return country(a).localeCompare(country(b)); });
    sel.innerHTML = '<option value="">Not set</option>' + homes.map(function (cc) { return '<option value="' + cc + '" data-search="' + esc(ALIAS[cc] || "") + '">' + flag(cc) + " " + esc(country(cc)) + "</option>"; }).join("");
    sel.value = S.home || "";
    sel.addEventListener("change", function () { S.home = sel.value; save(); show(current); renderSaved(); });
    if (window.MESSelect) MESSelect.enhance(sel, {placeholder: "Search countries…", noun: "countries"});
  })();

  // ---- results
  function carrierBtn(c, n, big) {
    var conf = c.conf === "high" ? "Best match" : c.conf === "likely" ? "Likely" : c.conf === "maybe" ? "Possible" : "Universal";
    var cls = "tk-cbtn" + (big ? " tk-cbtn--big" : "") + " tk-c-" + c.conf;
    var badge = '<span class="tk-dot" style="background:' + c.color + '"></span>';
    if (!c.direct) return '<button type="button" class="' + cls + '" data-copyopen="' + esc(c.url) + '" data-n="' + esc(n) + '" title="' + esc(c.why) + '">' + badge + '<span class="tk-cname">Copy number &amp; open ' + esc(c.name) + '</span><span class="tk-conf">' + conf + "</span></button>";
    return '<a class="' + cls + '" href="' + esc(c.url) + '" target="_blank" rel="noopener" title="' + esc(c.why) + '">' + badge + '<span class="tk-cname">' + (big ? "Track on " : "") + esc(c.name) + ' &#8599;</span><span class="tk-conf">' + conf + "</span></a>";
  }
  function card(n) {
    var d = T.detect(n, {home: S.home});
    var sv = savedItem(n), h = '<article class="tu-card tk-card" data-n="' + esc(n) + '">';
    h += '<div class="tk-chead"><div class="tk-num" title="Tracking number">' + esc(group(n)) + '</div><div class="tk-cact">' +
      '<button type="button" class="tu-btn tu-btn--ghost tk-sm" data-copy="' + esc(n) + '">Copy</button>' +
      '<button type="button" class="tu-btn ' + (sv ? "tu-btn--ghost" : "tu-btn--primary") + ' tk-sm" data-save="' + esc(n) + '">' + (sv ? "&#9733; Saved" : "&#9734; Save") + "</button></div></div>";
    if (!d || d.conf === "unknown") {
      h += '<p class="tk-info">We could not tell which company this number belongs to. These universal trackers check hundreds of carriers:</p><div class="tk-others">';
      T.UNIVERSAL.forEach(function (id) { h += carrierBtn({id: id, name: T.CARRIERS[id][0], url: T.url(id, n), conf: "any", color: T.CARRIERS[id][4], direct: true, why: "Universal tracker"}, n); });
      return h + "</div></article>";
    }
    var tags = ['<span class="tk-tag">' + esc(d.info) + "</span>"];
    if (d.origin && d.origin !== "XX") tags.push('<span class="tk-tag">' + flag(d.origin) + " Posted in " + esc(country(d.origin)) + "</span>");
    if (d.check === true) tags.push('<span class="tk-tag tk-ok">&#10003; Check digit OK</span>');
    if (d.check === false) tags.push('<span class="tk-tag tk-bad">&#9888; Check digit does not match: look for a typo</span>');
    h += '<div class="tk-tags">' + tags.join("") + "</div>";
    if (d.alt) h += '<p class="tu-note">The tracking number is usually the last 12 digits: <b>' + esc(d.alt) + "</b>.</p>";
    var first = d.carriers[0], rest = d.carriers.slice(1);
    h += '<div class="tk-best">' + carrierBtn(first, n, true) + (first.why ? '<span class="tk-why">' + esc(first.why) + "</span>" : "") + "</div>";
    if (rest.length) h += '<div class="tk-others">' + rest.map(function (c) { return carrierBtn(c, n); }).join("") + "</div>";
    return h + "</article>";
  }
  function show(list) {
    current = list;
    $("tk-results").innerHTML = list.map(card).join("");
  }
  function run(text, from) {
    var found = T.extract(text, {home: S.home}).map(function (x) { return x.n; });
    if (!found.length) {
      var c = T.clean(text);
      if (c.length >= 6 && c.length <= 40 && text.split(/\n/).filter(function (l) { return l.trim(); }).length <= 1) found = [c];
    }
    if (!found.length) { show([]); status(text.trim() ? "No tracking number found in that" + (from ? " " + from : " text") + "." : ""); return []; }
    status(found.length > 1 ? found.length + " tracking numbers found." : "");
    show(found);
    setQuery(found);
    return found;
  }
  function setQuery(list) {
    try { var u = new URL(location.href); if (list.length) u.searchParams.set("n", list.join(",")); else u.searchParams.delete("n"); history.replaceState(null, "", u); } catch (e) {}
  }

  // clicks in results + saved list
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy],[data-save],[data-copyopen],[data-del],[data-open]");
    if (!b || !$("tk").contains(b)) return;
    if (b.dataset.copy) copy(b.dataset.copy, "Tracking number copied");
    else if (b.dataset.copyopen) { copy(b.dataset.n, "Number copied: paste it on the page that opened"); window.open(b.dataset.copyopen, "_blank", "noopener"); }
    else if (b.dataset.save) toggleSave(b.dataset.save);
    else if (b.dataset.del) removeSaved(b.dataset.del);
    else if (b.dataset.open) { $("tk-text").value = b.dataset.open; run(b.dataset.open); $("tk-results").scrollIntoView({behavior: "smooth", block: "start"}); }
  });

  // ---- saved parcels
  function toggleSave(n) {
    var sv = savedItem(n);
    if (sv) removeSaved(n);
    else {
      var d = T.detect(n, {home: S.home});
      S.items.unshift({n: n, label: "", added: Date.now(), done: false, cid: d && d.carriers[0] ? d.carriers[0].id : ""});
      save(); toast("Saved to My parcels");
    }
    show(current); renderSaved();
  }
  function removeSaved(n) {
    var i = S.items.findIndex(function (x) { return x.n === n; }); if (i < 0) return;
    var gone = S.items.splice(i, 1)[0]; save(); show(current); renderSaved();
    toast('Removed. <button type="button" class="tk-undo">Undo</button>', true);
    var u = document.querySelector("#tk-toast .tk-undo");
    if (u) u.onclick = function () { S.items.splice(i, 0, gone); save(); show(current); renderSaved(); toast("Back in My parcels"); };
  }
  function renderSaved() {
    var w = $("tk-savedwrap"), list = $("tk-saved");
    w.hidden = !S.items.length;
    if (!S.items.length) return;
    var open = S.items.filter(function (x) { return !x.done; }), done = S.items.length - open.length;
    $("tk-scount").textContent = open.length + " on the way" + (done ? " · " + done + " arrived" : "");
    $("tk-showdone").hidden = !done;
    $("tk-showdone").textContent = S.showDone ? "Hide arrived" : "Show arrived (" + done + ")";
    var rows = S.items.filter(function (x) { return S.showDone || !x.done; });
    list.innerHTML = rows.map(function (x) {
      var d = T.detect(x.n, {home: S.home}), c = d && d.conf !== "unknown" ? d.carriers[0] : null;
      if (x.cid && d) d.carriers.forEach(function (k) { if (k.id === x.cid) c = k; });
      var date = new Date(x.added).toLocaleDateString(undefined, {month: "short", day: "numeric", year: new Date(x.added).getFullYear() === new Date().getFullYear() ? undefined : "numeric"});
      var opts = d && d.conf !== "unknown" ? d.carriers.map(function (k) { return '<option value="' + k.id + '"' + (c && k.id === c.id ? " selected" : "") + ">" + esc(k.name) + "</option>"; }).join("") : "";
      return '<div class="tk-row' + (x.done ? " is-done" : "") + '" data-n="' + esc(x.n) + '">' +
        '<label class="tk-done" title="Arrived"><input type="checkbox" data-done="' + esc(x.n) + '"' + (x.done ? " checked" : "") + '><span class="tk-sr">Arrived</span></label>' +
        '<div class="tk-rmain"><input class="tk-label" data-label="' + esc(x.n) + '" value="' + esc(x.label) + '" placeholder="Name it (e.g. New microphone)" maxlength="60">' +
        '<div class="tk-rsub"><button type="button" class="tk-link" data-open="' + esc(x.n) + '">' + esc(group(x.n)) + '</button><span>· added ' + esc(date) + "</span></div></div>" +
        '<div class="tk-ract">' + (opts ? '<select class="tu-select tk-rsel" data-cid="' + esc(x.n) + '" aria-label="Carrier">' + opts + "</select>" : "") +
        (c ? '<a class="tu-btn tu-btn--primary tk-sm" href="' + esc(c.url) + '" target="_blank" rel="noopener" data-track="' + esc(x.n) + '">Track &#8599;</a>' : '<a class="tu-btn tu-btn--primary tk-sm" href="' + esc(T.url("t17", x.n)) + '" target="_blank" rel="noopener">Track &#8599;</a>') +
        '<button type="button" class="tu-btn tu-btn--ghost tk-sm" data-copy="' + esc(x.n) + '">Copy</button>' +
        '<button type="button" class="tk-x" data-del="' + esc(x.n) + '" aria-label="Remove">&#215;</button></div></div>';
    }).join("") || '<p class="tu-note">Everything has arrived.</p>';
  }
  $("tk-saved").addEventListener("change", function (e) {
    var t = e.target, x;
    if (t.dataset.done && (x = savedItem(t.dataset.done))) { x.done = t.checked; save(); renderSaved(); if (t.checked) toast("Marked as arrived"); }
    else if (t.dataset.cid && (x = savedItem(t.dataset.cid))) { x.cid = t.value; save(); renderSaved(); }
  });
  $("tk-saved").addEventListener("input", function (e) { var t = e.target, x; if (t.dataset.label && (x = savedItem(t.dataset.label))) { x.label = t.value.slice(0, 60); save(); } });
  $("tk-showdone").onclick = function () { S.showDone = !S.showDone; save(); renderSaved(); };
  $("tk-copyall").onclick = function () {
    copy(S.items.map(function (x) { var d = T.detect(x.n, {home: S.home}); return (x.label ? x.label + ": " : "") + x.n + (d && d.conf !== "unknown" ? " (" + d.carriers[0].name + ")" : "") + (x.done ? " - arrived" : ""); }).join("\n"), "List copied");
  };
  $("tk-sharelist").onclick = function () {
    var open = S.items.filter(function (x) { return !x.done; }).map(function (x) { return x.n; });
    copy(location.origin + location.pathname + "?n=" + (open.length ? open : S.items.map(function (x) { return x.n; })).join(","), "Link copied (numbers only, no names)");
  };

  // ---- input
  var txt = $("tk-text");
  $("tk-go").onclick = function () { run(txt.value); };
  txt.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(txt.value); } });
  txt.addEventListener("input", function () { txt.style.height = ""; txt.rows = Math.max(2, Math.min(10, txt.value.split("\n").length + 1)); });
  txt.addEventListener("paste", function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].type.indexOf("image/") === 0) { e.preventDefault(); readImage(items[i].getAsFile()); return; }
    setTimeout(function () { run(txt.value); }, 0);
  });
  $("tk-paste").onclick = function () {
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { txt.value = t; txt.dispatchEvent(new Event("input")); run(t); }, function () { txt.focus(); toast("Press Ctrl+V (Cmd+V on a Mac) to paste"); });
    else { txt.focus(); toast("Press Ctrl+V (Cmd+V on a Mac) to paste"); }
  };
  $("tk-clear").onclick = function () { txt.value = ""; txt.style.height = ""; show([]); status(""); setQuery([]); txt.focus(); };
  $("tk-pic").onclick = function () { $("tk-file").click(); };
  $("tk-file").onchange = function () { var f = this.files[0]; this.value = ""; if (f) readImage(f); };
  var drop = $("tk-drop");
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-over"); }); });
  drop.addEventListener("drop", function (e) {
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) return readImage(f);
    var t = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (t) { txt.value = t; run(t); }
  });

  // ---- barcodes + text from pictures
  var formats = ["code_128", "code_39", "code_93", "qr_code", "data_matrix", "pdf417", "itf", "aztec", "codabar"];
  var bd = null;
  function nativeDetector() {
    if (bd !== null) return Promise.resolve(bd);
    if (!("BarcodeDetector" in window)) return Promise.resolve(bd = false);
    return window.BarcodeDetector.getSupportedFormats().then(function (sup) {
      var f = formats.filter(function (x) { return sup.indexOf(x) >= 0; });
      bd = f.length ? new window.BarcodeDetector({formats: f}) : false; return bd;
    }, function () { return (bd = false); });
  }
  var scripts = {};
  function loadScript(src) {
    if (!scripts[src]) scripts[src] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = function () { delete scripts[src]; rej(new Error("load")); }; document.head.appendChild(s); });
    return scripts[src];
  }
  // returns array of barcode texts found in an image source (ImageBitmap / canvas / video / Blob)
  function barcodes(src, blob) {
    return nativeDetector().then(function (det) {
      if (det) return det.detect(src).then(function (r) { return r.map(function (x) { return x.rawValue; }); }, function () { return []; });
      return loadScript(ZX_URL).then(function () {
        var input = blob;
        if (!input) { var c = toCanvas(src, 1600); input = c.getContext("2d").getImageData(0, 0, c.width, c.height); }
        return window.ZXingWASM.readBarcodes(input, {tryHarder: true, maxNumberOfSymbols: 8}).then(function (r) { return r.filter(function (x) { return x.isValid; }).map(function (x) { return x.text; }); });
      }).catch(function () { return []; });
    });
  }
  function toCanvas(src, max) {
    var w = src.videoWidth || src.width, h = src.videoHeight || src.height, k = Math.min(1, max / Math.max(w, h));
    var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); return c;
  }
  var tessWorker = null;
  function ocr(src) {
    status("Reading the text in the picture (the first time downloads the text reader, about 5 MB)…", true);
    return loadScript(TESS_URL).then(function () {
      if (!tessWorker) tessWorker = window.Tesseract.createWorker("eng");
      return tessWorker;
    }).then(function (w) {
      var c = toCanvas(src, 2400);
      return w.recognize(c).then(function (r) { return (r && r.data && r.data.text) || ""; });
    });
  }
  function readImage(file) {
    status("Looking for a barcode…", true);
    createImageBitmap(file).then(function (bmp) {
      return barcodes(bmp, file).then(function (codes) {
        var text = codes.join("\n"), got = text ? T.extract(text, {home: S.home}) : [];
        if (!got.length && codes.length === 1) { var c = T.clean(codes[0]); if (T.detect(c)) got = [{n: c}]; }
        if (got.length) { txt.value = got.map(function (x) { return x.n; }).join("\n"); txt.dispatchEvent(new Event("input")); run(txt.value, "barcode"); toast("Read from the barcode"); return; }
        return ocr(bmp).then(function (t) {
          var found = T.extract(t, {home: S.home});
          if (!found.length) { status("No tracking number found in the picture. Try a sharper photo, or type the number."); return; }
          txt.value = found.map(function (x) { return x.n; }).join("\n"); txt.dispatchEvent(new Event("input")); run(txt.value, "picture");
          toast("Read from the picture: please check the number");
        });
      });
    }).catch(function (e) { status("Could not read that picture" + (e && e.message ? " (" + e.message + ")" : "") + "."); });
  }

  // ---- live camera scan
  var stream = null, scanning = false;
  function closeCam() {
    scanning = false; $("tk-cam").hidden = true; document.body.classList.remove("tk-camopen");
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null;
  }
  $("tk-scan").onclick = function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $("tk-file").setAttribute("capture", "environment"); $("tk-file").click(); return; }
    navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: "environment"}, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false}).then(function (s) {
      stream = s; var v = $("tk-video"); v.srcObject = s; v.play();
      $("tk-cam").hidden = false; document.body.classList.add("tk-camopen"); scanning = true;
      $("tk-camtext").textContent = "Point the camera at the barcode or the tracking number";
      loop();
    }, function () { toast("Camera not available: choose a photo instead"); $("tk-file").setAttribute("capture", "environment"); $("tk-file").click(); });
  };
  function found(codes) {
    var text = codes.join("\n"), got = T.extract(text, {home: S.home});
    if (!got.length) codes.forEach(function (c) { c = T.clean(c); if (T.detect(c)) got.push({n: c}); });
    if (!got.length) return false;
    closeCam();
    txt.value = got.map(function (x) { return x.n; }).join("\n"); txt.dispatchEvent(new Event("input")); run(txt.value, "barcode");
    if (navigator.vibrate) navigator.vibrate(60);
    toast("Scanned"); return true;
  }
  function loop() {
    if (!scanning) return;
    var v = $("tk-video");
    if (v.readyState < 2) return setTimeout(loop, 200);
    barcodes(v).then(function (codes) { if (!scanning) return; if (codes.length && found(codes)) return; setTimeout(loop, 250); });
  }
  $("tk-camclose").onclick = closeCam;
  $("tk-camread").onclick = function () {
    var v = $("tk-video"); if (v.readyState < 2) return;
    var c = toCanvas(v, 2400); $("tk-camtext").textContent = "Reading the text…";
    ocr(c).then(function (t) {
      var got = T.extract(t, {home: S.home});
      if (got.length) found(got.map(function (x) { return x.n; }));
      else { $("tk-camtext").textContent = "No number found: hold it closer and keep it still"; status(""); }
    });
  };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && scanning) closeCam(); });

  // ---- carrier directory
  function renderDir() {
    var q = ($("tk-dirq").value || "").toLowerCase().trim(), ids = Object.keys(T.CARRIERS);
    $("tk-dircount").textContent = ids.length;
    var rows = ids.map(function (id) { var c = T.CARRIERS[id]; return {id: id, name: c[0], home: c[2], cc: c[3], color: c[4], where: c[3] === "*" ? "Universal" : c[3] ? country(c[3]) : "Worldwide"}; })
      .filter(function (r) { return !q || (r.name + " " + r.where + " " + r.cc).toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    $("tk-dirlist").innerHTML = rows.map(function (r) { return '<a class="tk-dirrow" href="' + esc(r.home) + '" target="_blank" rel="noopener"><span class="tk-dot" style="background:' + r.color + '"></span><b>' + esc(r.name) + "</b><span>" + (r.cc && r.cc !== "*" ? flag(r.cc) + " " : "") + esc(r.where) + "</span></a>"; }).join("") || '<p class="tu-note">No carrier matches.</p>';
  }
  $("tk-dirq").addEventListener("input", renderDir);
  renderDir();

  // ---- start
  renderSaved();
  var q = T.parseQuery(location.search);
  if (q.length) { txt.value = q.join("\n"); txt.dispatchEvent(new Event("input")); run(txt.value); }
  window.MESTrackDebug = {run: run, state: function () { return S; }};
})();
