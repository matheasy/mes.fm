// node tool_apps_src/tracking-tests.js
const T = require("./tracking/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function top(code, opt) { const d = T.detect(code, opt); return d && d.carriers[0].id; }

// S10: the user's example
let d = T.detect("LA717056590GB");
ok(d && d.check === true, "S10 check digit LA717056590GB");
ok(d.carriers[0].id === "royalmail" && d.carriers[0].conf === "high", "S10 GB -> Royal Mail first");
ok(d.carriers[0].url === "https://www.royalmail.com/track-your-item#/tracking-results/LA717056590GB", "Royal Mail link");
ok(d.origin === "GB", "origin GB");
ok(T.detect("LA717056591GB").check === false, "S10 typo caught");
ok(T.detect("LA 717 056 590 GB").n === "LA717056590GB", "spaces removed");
ok(T.s10Check("47312482") === 9, "UPU sample RR473124829GB");
d = T.detect("LA717056590GB", {home: "CA"});
ok(d.carriers.some(c => c.id === "canadapost" && /your country/.test(c.why)), "home post added for S10");
ok(d.carriers.slice(-3).map(c => c.id).join() === "t17,parcelsapp,ship24", "universal trackers last");
ok(top("RR123456785CN") === "chinapost", "S10 CN -> China Post");

// UPS sample with valid check digit
ok(T.upsCheck("1Z999AA10123456784"), "UPS sample check");
ok(!T.upsCheck("1Z999AA10123456785"), "UPS bad check");
ok(top("1Z999AA10123456784") === "ups", "UPS detect");
ok(T.detect("1z 999 aa1 01 2345 6784").n === "1Z999AA10123456784", "UPS lower case + spaces");

// USPS
const usps = "9400111899223197428490";
ok(top(usps) === "usps", "USPS 22 digits");
ok(T.clean("420902109400111899223197428490") === usps, "USPS barcode 420+ZIP stripped");
ok(top("TBA123456789012") === "amazon", "Amazon TBA");
ok(top("TBC123456789012") === "amazon", "Amazon TBC");
ok(top("GM2951173225174494") === "dhlecom", "DHL eCommerce GM");
ok(top("JJD0099999999999999") === "dhl", "DHL JJD");
ok(top("JD0002252559152513") === "yodel", "Yodel");
ok(top("YT2012345678901234") === "yunexpress", "YunExpress");
ok(top("LP00123456789012") === "cainiao", "Cainiao LP");
ok(top("1234567890123456", {home: "CA"}) === "canadapost", "16 digits Canada Post");
ok(top("12345678901234") === "dpd", "14 digits DPD");

// FedEx 12 check digit consistency: build a valid one
function fedexMake(d11) { const w = [1, 3, 7]; let s = 0; for (let i = 10, k = 0; i >= 0; i--, k++) s += +d11[i] * w[k % 3]; return d11 + ((s % 11) % 10); }
const fx = fedexMake("12345678901");
ok(T.fedex12(fx), "FedEx 12 check");
ok(top(fx) === "fedex", "FedEx 12 first");
// DHL 10
ok(T.mod7("1234567892") === (123456789 % 7 === 2), "mod7");

// not tracking numbers
ok(T.detect("hello") === null, "word is not a number");
ok(T.detect("1234") === null, "too short");

// URLs
ok(T.fromUrl("https://www.royalmail.com/track-your-item#/tracking-results/LA717056590GB") === "LA717056590GB", "from Royal Mail URL");
ok(T.fromUrl("https://tools.usps.com/go/TrackConfirmAction?tLabels=" + usps) === usps, "from USPS URL");
ok(T.fromUrl("https://www.ups.com/track?loc=en_US&tracknum=1Z999AA10123456784") === "1Z999AA10123456784", "from UPS URL");
ok(T.fromUrl("javascript:alert(1)") === "", "non-http refused");

// extract from an email
const mail = `Hi! Your order has shipped.
Tracking number: LA 717 056 590 GB
Order #123456, call us at 604 555 1234.
UPS: 1Z999AA10123456784
Track: https://tools.usps.com/go/TrackConfirmAction?tLabels=${usps}`;
const ex = T.extract(mail).map(x => x.n);
ok(ex.includes("LA717056590GB"), "extract S10 with spaces");
ok(ex.includes("1Z999AA10123456784"), "extract UPS");
ok(ex.includes(usps), "extract from URL");
ok(!ex.some(n => /^604/.test(n) || n === "123456"), "phone / order numbers ignored: " + ex.join());
ok(T.extract("1234567890123456").length === 1, "single plain number accepted");
ok(T.extract("9400 1118 9922 3197 4284 90")[0].n === usps, "spaced USPS");

// every carrier with a link has {n}
Object.keys(T.CARRIERS).forEach(id => { const c = T.CARRIERS[id]; ok(!c[1] || (c[1].includes("{n}") && /^https:\/\//.test(c[1])), "template " + id); ok(/^https:\/\//.test(c[2]), "home " + id); });
Object.keys(T.POST).forEach(k => T.POST[k].forEach(id => ok(T.CARRIERS[id], "POST " + k + " -> " + id)));
ok(T.guessHome(["en-CA", "en"]) === "CA", "guessHome");
ok(T.parseQuery("?n=LA717056590GB,1Z999AA10123456784").length === 2, "parseQuery");

const ex2 = T.extract("Your order shipped!\nCanada Post tracking: 7023 2109 8765 4321\nCall 604 555 1234\n7023210987654322").map(x => x.n);
ok(ex2.includes("7023210987654321") && ex2.includes("7023210987654322") && !ex2.some(n => /^604/.test(n)), "keyword line + bare-number line: " + ex2.join());
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
