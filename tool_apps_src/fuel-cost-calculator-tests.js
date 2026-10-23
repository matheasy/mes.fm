// node tool_apps_src/fuel-cost-calculator-tests.js
var FC = require("./fuel-cost-calculator/lib.js"), n = 0, bad = 0;
function near(a, b, tol, msg) { n++; if (!(Math.abs(a - b) <= tol)) { bad++; console.log("FAIL", msg, "got", a, "want", b); } }
function eq(a, b, msg) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log("FAIL", msg, "got", a, "want", b); } }
// constants + conversions
near(FC.K_US, 235.2145833, 1e-6, "US constant"); near(FC.K_UK, 282.4809363, 1e-6, "UK constant");
near(FC.toL100(30, "mpgus"), 7.84, 0.005, "30 mpg US = 7.84 L/100 km"); near(FC.toL100(30, "mpguk"), 9.42, 0.005, "30 mpg UK = 9.42 L/100 km");
near(FC.toL100(20, "kml"), 5, 1e-9, "20 km/L = 5 L/100"); near(FC.fromL100(5, "mpgus"), 47.04, 0.005, "5 L/100 = 47.04 mpg US");
near(FC.fromL100(FC.toL100(37.3, "mpguk"), "mpguk"), 37.3, 1e-9, "round trip mpg UK");
var all = FC.allEcon(8); near(all.kml, 12.5, 1e-9, "8 L/100 = 12.5 km/L"); near(all.mpgus, 29.40, 0.005, "8 L/100 US"); near(all.mpguk, 35.31, 0.005, "8 L/100 UK");
near(FC.fromL100(FC.toL100(30, "mpgus"), "mpguk"), 36.03, 0.005, "30 US mpg = 36.03 UK mpg");
eq(FC.toL100(0, "mpgus"), null, "zero economy"); eq(FC.toL100(-3, "kml"), null, "negative economy");
near(FC.toKm(100, "mi"), 160.9344, 1e-9, "100 mi"); near(FC.fromKm(160.9344, "mi"), 100, 1e-9, "km back to mi");
near(FC.toL(1, "galus"), 3.785411784, 1e-12, "US gal"); near(FC.toL(1, "galuk"), 4.54609, 1e-12, "UK gal"); near(FC.fromL(4.54609, "galuk"), 1, 1e-12, "L to UK gal");
near(FC.pricePerL(3.785411784, "galus"), 1, 1e-12, "price per US gal"); near(FC.pricePerL(1.5, "l"), 1.5, 1e-12, "price per L");
// EV units
near(FC.toKwh100(4, "mikwh"), 15.534, 0.001, "4 mi/kWh = 15.53 kWh/100 km"); near(FC.toKwh100(250, "whmi"), 15.534, 0.001, "250 Wh/mi");
near(FC.toKwh100(160, "whkm"), 16, 1e-9, "160 Wh/km"); near(FC.fromKwh100(FC.toKwh100(3.3, "mikwh"), "mikwh"), 3.3, 1e-9, "EV round trip");
near(FC.toKwh100(25, "kwh100mi"), 15.534, 0.001, "25 kWh/100 mi");
// costs
var t = FC.trip({ km: 500, l100: 8, pricePerL: 1.6, people: 4 });
near(t.litres, 40, 1e-9, "500 km at 8 L/100"); near(t.cost, 64, 1e-9, "cost"); near(t.perPerson, 16, 1e-9, "per person"); near(t.perKm, 0.128, 1e-9, "per km");
near(t.co2kg, 92.4, 1e-9, "CO2 gasoline");
t = FC.trip({ km: 500, l100: 8, pricePerL: 1.6, people: 4, roundTrip: true, fuel: "diesel" }); near(t.cost, 128, 1e-9, "round trip"); near(t.co2kg, 214.4, 1e-9, "CO2 diesel");
// US example: 300 miles at 25 mpg, $3.50/gal = 12 gal = $42
var l100 = FC.toL100(25, "mpgus"), tr = FC.trip({ km: FC.toKm(300, "mi"), l100: l100, pricePerL: FC.pricePerL(3.5, "galus") });
near(FC.fromL(tr.litres, "galus"), 12, 1e-9, "300 mi / 25 mpg = 12 gal"); near(tr.cost, 42, 1e-9, "12 gal x $3.50"); near(tr.perMi, 0.14, 1e-9, "per mile");
// UK example: 200 miles at 45 mpg UK, 1.45 GBP/L
tr = FC.trip({ km: FC.toKm(200, "mi"), l100: FC.toL100(45, "mpguk"), pricePerL: 1.45 }); near(tr.litres, 200 / 45 * FC.GAL_UK, 1e-9, "UK litres"); near(tr.cost, 29.30, 0.005, "UK cost");
eq(FC.trip({ km: 100, l100: 5, pricePerL: 2, people: 0 }).people, 1, "people at least 1");
// fill-up
near(FC.fillup(612, 45.3), 7.402, 0.001, "fill-up 612 km / 45.3 L"); eq(FC.fillup(0, 40), null, "fill-up zero distance");
near(FC.fromL100(FC.fillup(FC.toKm(350, "mi"), FC.toL(11.2, "galus")), "mpgus"), 31.25, 1e-9, "fill-up mpg US");
// EV + break-even
var ev = FC.evTrip({ km: 500, kwh100: 16, pricePerKwh: 0.15, loss: 0.1, gridG: 400 }); near(ev.kwhCar, 80, 1e-9, "EV kWh car"); near(ev.kwh, 88.889, 0.001, "EV wall kWh"); near(ev.cost, 13.333, 0.001, "EV cost"); near(ev.co2kg, 35.556, 0.001, "EV CO2");
near(FC.breakEven(6000, 2000, 500), 4, 1e-9, "break-even 4 years"); eq(FC.breakEven(6000, 500, 800), null, "never pays back"); eq(FC.breakEven(0, 1, 2), 0, "no extra cost");
// parsing + rounding
near(FC.num("1,234.5"), 1234.5, 1e-9, "thousands"); near(FC.num("1,65"), 1.65, 1e-9, "decimal comma"); near(FC.num("$3.49"), 3.49, 1e-9, "currency"); near(FC.num("1.234,5"), 1234.5, 1e-9, "european");
eq(isNaN(FC.num("abc")), true, "junk"); eq(FC.fixed(1234.567, 2), "1,234.57", "fixed"); eq(FC.round(2.345, 2), 2.35, "half up");
eq(FC.mapUrl("Vancouver", "Seattle"), "https://www.google.com/maps/dir/?api=1&origin=Vancouver&destination=Seattle&travelmode=driving", "map url");
console.log(n - bad + "/" + n + " passed"); if (bad) process.exit(1);
