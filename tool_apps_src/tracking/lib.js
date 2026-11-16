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
