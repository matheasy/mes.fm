/* MES BMI Calculator for Kids and Teens: BMI-for-age percentiles from the CDC 2000 growth charts (LMS method) and the CDC 2022 extended
   percentiles for BMI at or above the 95th percentile. Pure, node-testable (tests: tool_apps_src/bmi-kids-tests.js). Needs CDC_BMI (data.js,
   added after this file in the browser build, so it is looked up when needed). Exposed as KB. */
var KB = (function () {
	'use strict';
	function D() { return typeof CDC_BMI !== 'undefined' ? CDC_BMI : require('./data.js'); }
	var MIN = 24, MAX = 240;   // 2 years up to (not including) 20 years, in months
	/* L, M, S at an age in months (linear between the monthly rows, like CDC's own programs) */
	function lms(sex, months) {
		var t = D()[sex === 'm' ? 'm' : 'f'], a = Math.max(t[0][0], Math.min(t[t.length - 1][0], months)), i = Math.min(t.length - 2, Math.max(0, Math.floor(a - t[0][0])));
		while (i > 0 && t[i][0] > a) i--; while (i < t.length - 2 && t[i + 1][0] < a) i++;
		var p = t[i], q = t[i + 1], w = (a - p[0]) / (q[0] - p[0]);
		return [p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w, p[3] + (q[3] - p[3]) * w];
	}
	function cdf(z) { // Abramowitz-Stegun 26.2.17 (|error| < 7.5e-8)
		var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989422804014327 * Math.exp(-z * z / 2), p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
		return z > 0 ? 1 - p : p;
	}
	function invcdf(p) { // Acklam's rational approximation (relative error < 1.2e-9)
		if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
		var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
			b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
			c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
			d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416], q, r;
		if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
		if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
		q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
	}
	function zscore(sex, months, bmi) { var p = lms(sex, months), L = p[0], M = p[1], S = p[2]; return L === 0 ? Math.log(bmi / M) / S : (Math.pow(bmi / M, L) - 1) / (L * S); }
	function bmiAtZ(sex, months, z) { var p = lms(sex, months), L = p[0], M = p[1], S = p[2]; return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L); }
	/* the CDC 2022 extended method: above the 95th percentile the BMI is placed on a half-normal curve (sigma by sex and age in years, Wei et al. 2020 / CDC 2022) */
	function sigma(sex, months) { var y = months / 12, s = sex === 'm' ? 0.3728 + 0.5196 * y - 0.0091 * y * y : 0.8334 + 0.3712 * y - 0.0011 * y * y; return Math.round(s * 1e8) / 1e8; }
	function p95(sex, months) { return bmiAtZ(sex, months, invcdf(0.95)); }
	/* the BMI at a percentile, using the extended curve above the 95th (so 98, 99, 99.9 match CDC's extended chart) */
	function bmiAt(sex, months, pct) {
		if (pct < 95) return bmiAtZ(sex, months, invcdf(pct / 100));
		return p95(sex, months) + invcdf((pct - 90) / 10) * sigma(sex, months);
	}
	function percentile(sex, months, bmi) {
		var lp = cdf(zscore(sex, months, bmi)) * 100;
		if (lp < 95) return lp;
		return 90 + 10 * cdf((bmi - p95(sex, months)) / sigma(sex, months));
	}
	function pctOf95(sex, months, bmi) { return 100 * bmi / p95(sex, months); }
	/* CDC categories: underweight < 5th, healthy weight 5th to < 85th, overweight 85th to < 95th, obesity >= 95th;
	   severe obesity = BMI >= 120% of the 95th percentile (class 2; class 3 from 140%) */
	var CATS = {
		under: { name: 'Underweight', range: 'below the 5th percentile' },
		healthy: { name: 'Healthy weight', range: '5th to less than the 85th percentile' },
		over: { name: 'Overweight', range: '85th to less than the 95th percentile' },
		obese: { name: 'Obesity', range: '95th percentile or higher' },
		severe: { name: 'Severe obesity', range: '120% of the 95th percentile or higher' }
	};
	function category(sex, months, bmi) {
		var p = percentile(sex, months, bmi), r = pctOf95(sex, months, bmi);
		if (r >= 120 - 1e-9) return 'severe'; if (p >= 95) return 'obese'; if (p >= 85) return 'over'; if (p >= 5) return 'healthy'; return 'under';
	}
	function analyse(sex, months, kg, cm) {
		if (!(kg > 0 && cm > 0)) return null;
		var bmi = kg / (cm / 100 * cm / 100), p = percentile(sex, months, bmi), c = category(sex, months, bmi), r = pctOf95(sex, months, bmi);
		return { bmi: bmi, pct: p, z: zscore(sex, months, bmi), cat: c, pctOf95: r, cls3: r >= 140,
			p5: bmiAt(sex, months, 5), p50: bmiAt(sex, months, 50), p85: bmiAt(sex, months, 85), p95: p95(sex, months), sev: 1.2 * p95(sex, months) };
	}
	function bmiOf(kg, cm) { return kg / Math.pow(cm / 100, 2); }
	/* age: completed years + months -> the middle of that month (CDC: add 0.5 to whole months); dates -> exact months (days / 30.4375) */
	function monthsFromYM(y, m) { return (y || 0) * 12 + (m || 0) + 0.5; }
	function monthsFromDays(days) { return days / 30.4375; }
	function ageCheck(months) {
		if (!isFinite(months)) return 'Enter the age.';
		if (months < MIN) return 'These charts start at age 2. For babies and toddlers under 2, use the WHO growth charts.';
		if (months >= MAX) return 'From age 20, BMI is read with the adult categories.';
		return '';
	}
	function ageText(months) { var y = Math.floor(months / 12), m = Math.floor(months - y * 12); return y + ' year' + (y === 1 ? '' : 's') + (m ? ' ' + m + ' month' + (m === 1 ? '' : 's') : ''); }
	function kgToLb(kg) { return kg / 0.45359237; } function lbToKg(lb) { return lb * 0.45359237; }
	function cmToFtIn(cm) { var t = cm / 2.54, f = Math.floor(t / 12), i = t - f * 12; if (i > 11.95) { f++; i = 0; } return [f, i]; }
	function ftInToCm(ft, inch) { return ((ft || 0) * 12 + (inch || 0)) * 2.54; }
	/* "72nd", "99.4th", "<0.1": whole numbers between 1 and 99, one decimal at the ends */
	function ordinal(n) { var r = Math.round(n), v = r % 100, x = r % 10; return r + (v >= 11 && v <= 13 ? 'th' : x === 1 ? 'st' : x === 2 ? 'nd' : x === 3 ? 'rd' : 'th'); }
	function pctText(p) {
		if (p < 0.1) return 'below the 0.1st'; if (p >= 99.95) return '99.9th or higher';
		if (p < 1 || p >= 99) return (Math.floor(p * 10) / 10).toFixed(1) + 'th';
		return ordinal(Math.floor(p) === 0 ? 1 : Math.floor(p));
	}
	return { MIN: MIN, MAX: MAX, CATS: CATS, lms: lms, cdf: cdf, invcdf: invcdf, zscore: zscore, bmiAtZ: bmiAtZ, sigma: sigma, p95: p95, bmiAt: bmiAt, percentile: percentile,
		pctOf95: pctOf95, category: category, analyse: analyse, bmiOf: bmiOf, monthsFromYM: monthsFromYM, monthsFromDays: monthsFromDays, ageCheck: ageCheck, ageText: ageText,
		kgToLb: kgToLb, lbToKg: lbToKg, cmToFtIn: cmToFtIn, ftInToCm: ftInToCm, ordinal: ordinal, pctText: pctText };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = KB;

/* CDC 2000 BMI-for-age growth charts: LMS parameters by sex (m / f), one row per month of age [age in months, L, M, S], 23.5 to 240 months.
   Public domain (CDC / NCHS). Generated by build_cdc_bmi_data.py from CDC's reference file CDCref_d.csv; do not edit. */
var CDC_BMI = {"m":[[23.5,-2.0399885,16.60228,0.0810575],[24.5,-1.9823736,16.547775,0.0801274],[25.5,-1.9241002,16.494428,0.079234],[26.5,-1.8654979,16.442596,0.0783894],[27.5,-1.8072619,16.392243,0.0775935],[28.5,-1.7501189,16.343337,0.0768465],[29.5,-1.6948158,16.295841,0.0761483],[30.5,-1.6421068,16.249724,0.0754991],[31.5,-1.5927444,16.204953,0.074899],[32.5,-1.5474424,16.161499,0.074348],[33.5,-1.5069026,16.119333,0.0738461],[34.5,-1.47177,16.078428,0.0733934],[35.5,-1.442629,16.038759,0.0729896],[36.5,-1.4199913,16.000304,0.0726344],[37.5,-1.4042776,15.963043,0.0723276],[38.5,-1.3958632,15.926954,0.0720686],[39.5,-1.3949353,15.892026,0.0718568],[40.5,-1.4016716,15.858241,0.0716913],[41.5,-1.4161003,15.825588,0.0715711],[42.5,-1.4381649,15.794057,0.0714951],[43.5,-1.467669,15.763643,0.0714621],[44.5,-1.5043763,15.734337,0.0714706],[45.5,-1.5479428,15.706136,0.0715192],[46.5,-1.5978964,15.679041,0.0716063],[47.5,-1.6537323,15.653052,0.0717302],[48.5,-1.7148693,15.628173,0.0718892],[49.5,-1.7806732,15.604408,0.0720817],[50.5,-1.8504685,15.581765,0.0723061],[51.5,-1.9235519,15.560251,0.0725606],[52.5,-1.9992204,15.539875,0.0728438],[53.5,-2.0767072,15.52065,0.0731543],[54.5,-2.155348,15.502584,0.0734907],[55.5,-2.2344386,15.48569,0.0738517],[56.5,-2.3133217,15.469977,0.0742362],[57.5,-2.3913813,15.455457,0.0746434],[58.5,-2.4680325,15.44214,0.0750723],[59.5,-2.5427815,15.430032,0.0755221],[60.5,-2.615166,15.419142,0.0759922],[61.5,-2.6847895,15.409474,0.0764821],[62.5,-2.7513169,15.401031,0.0769912],[63.5,-2.8144595,15.393818,0.0775191],[64.5,-2.8740248,15.387831,0.0780654],[65.5,-2.9298405,15.383069,0.0786296],[66.5,-2.9817968,15.37953,0.0792114],[67.5,-3.0298313,15.377206,0.0798103],[68.5,-3.0739242,15.376091,0.0804261],[69.5,-3.1140935,15.376177,0.0810582],[70.5,-3.15039,15.377453,0.0817062],[71.5,-3.182893,15.379909,0.0823697],[72.5,-3.2117051,15.383532,0.0830482],[73.5,-3.2369483,15.38831,0.083741],[74.5,-3.2587601,15.394229,0.0844477],[75.5,-3.2772815,15.401275,0.0851677],[76.5,-3.2926838,15.409433,0.0859002],[77.5,-3.3051241,15.418687,0.0866447],[78.5,-3.314769,15.429023,0.0874004],[79.5,-3.321786,15.440424,0.0881667],[80.5,-3.3263458,15.452876,0.0889429],[81.5,-3.3286027,15.466362,0.0897282],[82.5,-3.3287253,15.480867,0.0905219],[83.5,-3.3268702,15.496375,0.0913232],[84.5,-3.3231889,15.512869,0.0921313],[85.5,-3.317827,15.530336,0.0929455],[86.5,-3.3109239,15.548758,0.0937651],[87.5,-3.3026123,15.568121,0.0945893],[88.5,-3.2930184,15.588411,0.0954172],[89.5,-3.2822608,15.609611,0.0962483],[90.5,-3.2704546,15.631707,0.0970817],[91.5,-3.2577036,15.654686,0.0979167],[92.5,-3.2441082,15.678531,0.0987526],[93.5,-3.2297617,15.703231,0.0995887],[94.5,-3.2147513,15.728769,0.1004243],[95.5,-3.1991582,15.755133,0.1012586],[96.5,-3.1830579,15.78231,0.1020912],[97.5,-3.1665207,15.810286,0.1029212],[98.5,-3.1496103,15.839047,0.1037482],[99.5,-3.1323896,15.868581,0.1045714],[100.5,-3.1149112,15.898876,0.1053903],[101.5,-3.0972264,15.929918,0.1062043],[102.5,-3.0793831,15.961695,0.1070128],[103.5,-3.0614238,15.994195,0.1078153],[104.5,-3.0433861,16.027406,0.1086114],[105.5,-3.02531,16.061316,0.1094004],[106.5,-3.0072257,16.095913,0.1101819],[107.5,-2.9891646,16.131185,0.1109555],[108.5,-2.9711482,16.167122,0.1117207],[109.5,-2.953208,16.203712,0.1124771],[110.5,-2.935364,16.240942,0.1132242],[111.5,-2.9176352,16.278803,0.1139617],[112.5,-2.9000398,16.317284,0.1146893],[113.5,-2.8825938,16.356373,0.1154065],[114.5,-2.8653113,16.396059,0.1161131],[115.5,-2.8482047,16.436333,0.1168087],[116.5,-2.8312851,16.477183,0.117493],[117.5,-2.8145619,16.518598,0.1181658],[118.5,-2.7980435,16.56057,0.1188268],[119.5,-2.7817369,16.603087,0.1194758],[120.5,-2.765648,16.646138,0.1201125],[121.5,-2.7497822,16.689715,0.1207367],[122.5,-2.7341424,16.733807,0.1213482],[123.5,-2.7187329,16.778404,0.1219468],[124.5,-2.7035555,16.823495,0.1225325],[125.5,-2.688612,16.869072,0.123105],[126.5,-2.6739032,16.915125,0.1236642],[127.5,-2.6594294,16.961643,0.12421],[128.5,-2.6451905,17.008618,0.1247422],[129.5,-2.6311856,17.056039,0.1252609],[130.5,-2.6174135,17.103897,0.1257659],[131.5,-2.6038724,17.152183,0.1262571],[132.5,-2.5905601,17.200887,0.1267346],[133.5,-2.5774743,17.250001,0.1271983],[134.5,-2.5646118,17.299514,0.1276481],[135.5,-2.5519697,17.349417,0.128084],[136.5,-2.53954,17.399703,0.1285062],[137.5,-2.5273257,17.450361,0.1289145],[138.5,-2.5153202,17.501382,0.129309],[139.5,-2.5035194,17.552757,0.1296897],[140.5,-2.4919189,17.604477,0.1300568],[141.5,-2.4805141,17.656534,0.1304101],[142.5,-2.4693003,17.708918,0.1307499],[143.5,-2.4582727,17.761621,0.1310762],[144.5,-2.4474261,17.814634,0.131389],[145.5,-2.4367556,17.867947,0.1316886],[146.5,-2.4262559,17.921553,0.1319749],[147.5,-2.4159217,17.975443,0.1322481],[148.5,-2.4057476,18.029608,0.1325084],[149.5,-2.3957282,18.084039,0.1327558],[150.5,-2.385858,18.138728,0.1329906],[151.5,-2.3761315,18.193666,0.1332128],[152.5,-2.3665429,18.248844,0.1334226],[153.5,-2.3570869,18.304255,0.1336202],[154.5,-2.3477576,18.35989,0.1338058],[155.5,-2.3385496,18.41574,0.1339795],[156.5,-2.3294571,18.471797,0.1341415],[157.5,-2.3204746,18.528053,0.134292],[158.5,-2.3115964,18.584498,0.1344313],[159.5,-2.3028171,18.641126,0.1345594],[160.5,-2.2941311,18.697927,0.1346767],[161.5,-2.2855329,18.754893,0.1347834],[162.5,-2.2770172,18.812016,0.1348796],[163.5,-2.2685786,18.869288,0.1349656],[164.5,-2.2602118,18.9267,0.1350417],[165.5,-2.2519118,18.984244,0.135108],[166.5,-2.2436735,19.041912,0.1351649],[167.5,-2.2354918,19.099696,0.1352125],[168.5,-2.2273622,19.157587,0.1352511],[169.5,-2.2192798,19.215577,0.135281],[170.5,-2.2112402,19.273658,0.1353024],[171.5,-2.203239,19.331822,0.1353156],[172.5,-2.1952722,19.390061,0.1353208],[173.5,-2.1873356,19.448366,0.1353184],[174.5,-2.1794257,19.506729,0.1353086],[175.5,-2.1715388,19.565142,0.1352917],[176.5,-2.1636717,19.623596,0.1352679],[177.5,-2.1558214,19.682083,0.1352376],[178.5,-2.147985,19.740595,0.135201],[179.5,-2.1401603,19.799124,0.1351584],[180.5,-2.132345,19.857661,0.1351102],[181.5,-2.1245373,19.916198,0.1350565],[182.5,-2.1167357,19.974726,0.1349978],[183.5,-2.1089392,20.033237,0.1349343],[184.5,-2.1011469,20.091723,0.1348663],[185.5,-2.0933586,20.150174,0.1347941],[186.5,-2.0855744,20.208582,0.1347181],[187.5,-2.0777947,20.266939,0.1346385],[188.5,-2.0700206,20.325236,0.1345557],[189.5,-2.0622534,20.383465,0.1344699],[190.5,-2.0544951,20.441615,0.1343816],[191.5,-2.0467482,20.499679,0.1342909],[192.5,-2.0390154,20.557647,0.1341983],[193.5,-2.0313003,20.615511,0.1341041],[194.5,-2.0236068,20.673262,0.1340086],[195.5,-2.015942,20.730889,0.1339121],[196.5,-2.0083057,20.788385,0.133815],[197.5,-2.0007064,20.84574,0.1337176],[198.5,-1.9931501,20.902944,0.1336202],[199.5,-1.9856437,20.959989,0.1335232],[200.5,-1.9781945,21.016864,0.133427],[201.5,-1.9708103,21.073561,0.1333319],[202.5,-1.9634995,21.130069,0.1332382],[203.5,-1.9562711,21.186378,0.1331464],[204.5,-1.9491346,21.24248,0.1330567],[205.5,-1.9420997,21.298364,0.1329695],[206.5,-1.9351771,21.35402,0.1328853],[207.5,-1.9283775,21.409439,0.1328043],[208.5,-1.9217121,21.46461,0.132727],[209.5,-1.9151927,21.519524,0.1326537],[210.5,-1.9088311,21.574171,0.1325848],[211.5,-1.9026395,21.628539,0.1325207],[212.5,-1.8966304,21.682621,0.1324618],[213.5,-1.8908163,21.736404,0.1324086],[214.5,-1.8852099,21.78988,0.1323613],[215.5,-1.8798235,21.843038,0.1323204],[216.5,-1.8746703,21.895868,0.1322864],[217.5,-1.8697603,21.948362,0.1322596],[218.5,-1.8651132,22.000506,0.1322404],[219.5,-1.8607349,22.052292,0.1322293],[220.5,-1.8566338,22.103713,0.1322268],[221.5,-1.8528272,22.154756,0.1322332],[222.5,-1.8493232,22.205412,0.132249],[223.5,-1.8461316,22.255673,0.1322746],[224.5,-1.8432613,22.305528,0.1323105],[225.5,-1.8407202,22.354969,0.1323572],[226.5,-1.8385154,22.403987,0.1324151],[227.5,-1.8366559,22.452572,0.1324846],[228.5,-1.835138,22.500718,0.1325664],[229.5,-1.833972,22.548414,0.1326607],[230.5,-1.8331578,22.595654,0.1327682],[231.5,-1.8326956,22.64243,0.1328892],[232.5,-1.8325843,22.688733,0.1330244],[233.5,-1.832821,22.734557,0.1331741],[234.5,-1.8334008,22.779895,0.133339],[235.5,-1.8343174,22.824741,0.1335195],[236.5,-1.8355575,22.869089,0.1337162],[237.5,-1.8371195,22.912932,0.1339295],[238.5,-1.8389871,22.956264,0.1341601],[239.5,-1.8411461,22.999081,0.1344084],[240.0,-1.8423302,23.020294,0.1345394]],"f":[[23.5,-0.9487202,16.458753,0.0858777],[24.5,-1.0244968,16.388041,0.0850258],[25.5,-1.1026984,16.318972,0.0842141],[26.5,-1.1839663,16.25208,0.0834551],[27.5,-1.268071,16.187347,0.0827483],[28.5,-1.3547515,16.124754,0.0820927],[29.5,-1.4436897,16.064288,0.0814877],[30.5,-1.5345419,16.00593,0.0809324],[31.5,-1.6269281,15.949666,0.0804262],[32.5,-1.7204348,15.895482,0.0799682],[33.5,-1.8146353,15.843362,0.0795577],[34.5,-1.9090763,15.793291,0.0791942],[35.5,-2.0032961,15.745256,0.0788769],[36.5,-2.0968289,15.699242,0.0786053],[37.5,-2.1892119,15.655233,0.0783787],[38.5,-2.279992,15.613214,0.0781967],[39.5,-2.3687329,15.573168,0.0780587],[40.5,-2.4550213,15.53508,0.0779642],[41.5,-2.538472,15.498931,0.0779127],[42.5,-2.6187329,15.464704,0.0779037],[43.5,-2.695489,15.432378,0.0779368],[44.5,-2.7684648,15.401934,0.0780113],[45.5,-2.8374267,15.373352,0.0781268],[46.5,-2.9021782,15.346608,0.0782827],[47.5,-2.9625804,15.321682,0.0784784],[48.5,-3.018522,15.298549,0.0787133],[49.5,-3.0699366,15.277186,0.0789867],[50.5,-3.1167959,15.257569,0.0792978],[51.5,-3.1591073,15.239673,0.079646],[52.5,-3.1969111,15.223474,0.0800304],[53.5,-3.2302768,15.208945,0.0804501],[54.5,-3.2593002,15.196062,0.0809044],[55.5,-3.2841,15.184798,0.0813922],[56.5,-3.3048141,15.175129,0.0819126],[57.5,-3.321597,15.167028,0.0824647],[58.5,-3.3346156,15.160471,0.0830473],[59.5,-3.3440476,15.155431,0.0836595],[60.5,-3.3500777,15.151884,0.0843001],[61.5,-3.3528938,15.149805,0.0849682],[62.5,-3.3526914,15.149168,0.0856625],[63.5,-3.3496644,15.14995,0.086382],[64.5,-3.3439988,15.152126,0.0871256],[65.5,-3.3358896,15.155672,0.087892],[66.5,-3.3255225,15.160564,0.0886803],[67.5,-3.3130785,15.166779,0.0894891],[68.5,-3.2987326,15.174295,0.0903174],[69.5,-3.2826538,15.183087,0.0911641],[70.5,-3.2650039,15.193134,0.092028],[71.5,-3.2459375,15.204413,0.092908],[72.5,-3.2256065,15.216903,0.093803],[73.5,-3.2041461,15.230581,0.0947119],[74.5,-3.1816902,15.245427,0.0956336],[75.5,-3.1583635,15.26142,0.096567],[76.5,-3.1342828,15.278537,0.097511],[77.5,-3.1095579,15.29676,0.0984647],[78.5,-3.0842909,15.316066,0.099427],[79.5,-3.0585773,15.336437,0.1003968],[80.5,-3.0325055,15.357853,0.1013732],[81.5,-3.0061576,15.380293,0.1023552],[82.5,-2.9796094,15.403738,0.1033418],[83.5,-2.952931,15.428168,0.1043321],[84.5,-2.9261866,15.453565,0.1053253],[85.5,-2.8994353,15.47991,0.1063203],[86.5,-2.8727312,15.507184,0.1073164],[87.5,-2.8461237,15.535368,0.1083127],[88.5,-2.8196577,15.564444,0.1093084],[89.5,-2.7933741,15.594394,0.1103026],[90.5,-2.76731,15.625199,0.1112945],[91.5,-2.7414989,15.656841,0.1122835],[92.5,-2.7159709,15.689303,0.1132688],[93.5,-2.6907532,15.722567,0.1142496],[94.5,-2.6658701,15.756616,0.1152253],[95.5,-2.6413434,15.791431,0.1161952],[96.5,-2.6171922,15.826995,0.1171587],[97.5,-2.5934306,15.863292,0.1181151],[98.5,-2.570076,15.900305,0.1190638],[99.5,-2.5471415,15.938015,0.1200043],[100.5,-2.5246352,15.976408,0.120936],[101.5,-2.5025697,16.015465,0.1218584],[102.5,-2.4809519,16.05517,0.1227709],[103.5,-2.4597856,16.095507,0.1236731],[104.5,-2.4390801,16.136459,0.1245645],[105.5,-2.4188383,16.17801,0.1254446],[106.5,-2.3990637,16.220143,0.1263131],[107.5,-2.3797569,16.262843,0.1271695],[108.5,-2.3609205,16.306093,0.1280135],[109.5,-2.3425577,16.349878,0.1288446],[110.5,-2.3246633,16.394181,0.1296626],[111.5,-2.3072407,16.438987,0.1304671],[112.5,-2.2902877,16.484281,0.1312579],[113.5,-2.2738038,16.530046,0.1320345],[114.5,-2.2577821,16.576267,0.1327968],[115.5,-2.2422277,16.622929,0.1335445],[116.5,-2.2271328,16.670016,0.1342774],[117.5,-2.2124956,16.717513,0.1349953],[118.5,-2.1983127,16.765405,0.135698],[119.5,-2.1845808,16.813677,0.1363853],[120.5,-2.1712959,16.862314,0.137057],[121.5,-2.1584542,16.9113,0.137713],[122.5,-2.1460518,16.960622,0.1383533],[123.5,-2.1340843,17.010264,0.1389775],[124.5,-2.1225476,17.060212,0.1395858],[125.5,-2.1114374,17.110451,0.1401779],[126.5,-2.1007493,17.160967,0.1407539],[127.5,-2.0904788,17.211744,0.1413137],[128.5,-2.0806215,17.26277,0.1418572],[129.5,-2.0711729,17.314029,0.1423844],[130.5,-2.0621286,17.365507,0.1428953],[131.5,-2.0534842,17.417191,0.14339],[132.5,-2.0452351,17.469066,0.1438683],[133.5,-2.0373769,17.521118,0.1443305],[134.5,-2.0299067,17.573333,0.1447764],[135.5,-2.0228179,17.625699,0.1452061],[136.5,-2.0161071,17.6782,0.1456198],[137.5,-2.0097699,17.730823,0.1460175],[138.5,-2.0038021,17.783556,0.1463992],[139.5,-1.9981996,17.836383,0.1467652],[140.5,-1.9929581,17.889293,0.1471154],[141.5,-1.9880735,17.942272,0.14745],[142.5,-1.9835418,17.995306,0.1477691],[143.5,-1.979359,18.048382,0.1480729],[144.5,-1.9755212,18.101488,0.1483615],[145.5,-1.9720243,18.15461,0.1486351],[146.5,-1.9688645,18.207736,0.1488938],[147.5,-1.9660379,18.260853,0.1491378],[148.5,-1.9635409,18.313948,0.1493673],[149.5,-1.9613695,18.367009,0.1495824],[150.5,-1.9595201,18.420023,0.1497835],[151.5,-1.9579889,18.472977,0.1499706],[152.5,-1.9567723,18.52586,0.150144],[153.5,-1.9558665,18.57866,0.1503039],[154.5,-1.955268,18.631363,0.1504506],[155.5,-1.954973,18.683958,0.1505843],[156.5,-1.9549779,18.736433,0.1507051],[157.5,-1.9552791,18.788777,0.1508135],[158.5,-1.9558729,18.840977,0.1509095],[159.5,-1.9567556,18.893022,0.1509936],[160.5,-1.9579234,18.9449,0.1510659],[161.5,-1.9593727,18.996601,0.1511267],[162.5,-1.9610997,19.048111,0.1511764],[163.5,-1.9631005,19.099421,0.1512151],[164.5,-1.9653712,19.150519,0.1512432],[165.5,-1.967908,19.201394,0.151261],[166.5,-1.9707067,19.252035,0.1512689],[167.5,-1.9737633,19.302431,0.151267],[168.5,-1.9770736,19.352572,0.1512557],[169.5,-1.9806333,19.402447,0.1512354],[170.5,-1.984438,19.452045,0.1512063],[171.5,-1.9884831,19.501355,0.1511689],[172.5,-1.9927641,19.550369,0.1511234],[173.5,-1.9972761,19.599075,0.1510702],[174.5,-2.0020142,19.647463,0.1510096],[175.5,-2.0069733,19.695523,0.150942],[176.5,-2.0121482,19.743246,0.1508678],[177.5,-2.0175334,19.790621,0.1507872],[178.5,-2.0231232,19.837639,0.1507008],[179.5,-2.0289118,19.884291,0.1506088],[180.5,-2.0348931,19.930566,0.1505116],[181.5,-2.0410609,19.976456,0.1504097],[182.5,-2.0474086,20.021952,0.1503034],[183.5,-2.0539295,20.067044,0.1501932],[184.5,-2.0606165,20.111723,0.1500793],[185.5,-2.0674624,20.15598,0.1499623],[186.5,-2.0744595,20.199808,0.1498425],[187.5,-2.0816,20.243196,0.1497204],[188.5,-2.0888758,20.286136,0.1495964],[189.5,-2.0962783,20.328621,0.149471],[190.5,-2.1037988,20.370641,0.1493444],[191.5,-2.1114282,20.412189,0.1492173],[192.5,-2.119157,20.453256,0.1490901],[193.5,-2.1269754,20.493835,0.1489631],[194.5,-2.1348733,20.533916,0.1488369],[195.5,-2.1428402,20.573494,0.148712],[196.5,-2.1508652,20.612559,0.1485888],[197.5,-2.1589372,20.651105,0.1484677],[198.5,-2.1670446,20.689124,0.1483493],[199.5,-2.175177,20.726607,0.1482341],[200.5,-2.1833174,20.76355,0.1481226],[201.5,-2.1914578,20.799943,0.1480152],[202.5,-2.1995836,20.835781,0.1479126],[203.5,-2.2076815,20.871054,0.1478151],[204.5,-2.2157376,20.905758,0.1477233],[205.5,-2.2237399,20.939885,0.1476378],[206.5,-2.231668,20.973429,0.1475591],[207.5,-2.2395119,21.006382,0.1474877],[208.5,-2.2472571,21.038737,0.1474242],[209.5,-2.2548851,21.07049,0.1473692],[210.5,-2.2623821,21.101632,0.1473231],[211.5,-2.2697315,21.132158,0.1472867],[212.5,-2.2769172,21.162062,0.1472604],[213.5,-2.2839254,21.191335,0.1472448],[214.5,-2.2907314,21.219975,0.1472407],[215.5,-2.2973243,21.247973,0.1472485],[216.5,-2.3036878,21.275322,0.1472688],[217.5,-2.3098,21.302019,0.1473023],[218.5,-2.3156519,21.328055,0.1473495],[219.5,-2.3212173,21.353426,0.1474112],[220.5,-2.3264819,21.378125,0.147488],[221.5,-2.3314281,21.402146,0.1475805],[222.5,-2.3360385,21.425484,0.1476893],[223.5,-2.3402955,21.448132,0.1478152],[224.5,-2.3441817,21.470084,0.1479587],[225.5,-2.34768,21.491335,0.1481206],[226.5,-2.3507733,21.511879,0.1483016],[227.5,-2.3534447,21.53171,0.1485024],[228.5,-2.3556777,21.550822,0.1487235],[229.5,-2.3574561,21.569208,0.1489659],[230.5,-2.3587638,21.586864,0.1492301],[231.5,-2.3595854,21.603783,0.149517],[232.5,-2.3599057,21.619959,0.1498272],[233.5,-2.3597103,21.635387,0.1501615],[234.5,-2.3589805,21.650061,0.1505207],[235.5,-2.3577145,21.663973,0.1509054],[236.5,-2.3558924,21.677117,0.1513165],[237.5,-2.3535014,21.689489,0.1517548],[238.5,-2.3505287,21.701083,0.1522211],[239.5,-2.3469622,21.711892,0.1527162],[240.0,-2.3449584,21.716999,0.1529747]]};
if (typeof module !== 'undefined' && module.exports) module.exports = CDC_BMI;

/* MES BMI Calculator for Kids and Teens: UI. Maths = KB (lib.js) + CDC_BMI (data.js), both prepended. */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); }, KEY = 'mes-bmi-kids:v1';
	var S = { sex: 'f', mode: 'age', y: '', m: '0', birth: '', on: '', kg: '', cm: '' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('kb-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2000); }
	function num(v) { v = String(v || '').trim().replace(/\s/g, ''); if (/^\d+,\d+$/.test(v)) v = v.replace(',', '.'); var x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; }
	function r(x, d) { var f = Math.pow(10, d); return String(Math.round(x * f) / f); }
	function day(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null; }
	function todayIso() { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); }
	var NAMES = { under: 'Underweight', healthy: 'Healthy weight', over: 'Overweight', obese: 'Obesity', severe: 'Severe obesity' };
	var TEXT = {
		under: 'This BMI is below the 5th percentile for this age and sex. Some children are naturally slim and grow well, but it is worth mentioning to your child\'s doctor, who can check their growth over time and that they are getting enough to eat for growing.',
		healthy: 'This BMI is in the healthy weight range for this age and sex. Keep up the everyday basics: regular meals together, active play and enough sleep.',
		over: 'This BMI is in the overweight range for this age and sex (85th to less than the 95th percentile). BMI is a screening number, not a diagnosis: a doctor can tell whether it reflects body fat, muscle or a growth spurt. Small habits the whole family shares help more than any diet.',
		obese: 'This BMI is at or above the 95th percentile for this age and sex, in the range the CDC calls obesity. That is a good reason to talk with your child\'s doctor, who can look at the whole picture and suggest support for the family. Children should not be put on a weight-loss diet without medical advice.',
		severe: 'This BMI is at least 120% of the 95th percentile for this age and sex, the range the CDC calls severe obesity. Please talk with your child\'s doctor: there are family programs and treatments that help, and a doctor can check for anything that needs care. Children should not be put on a weight-loss diet without medical advice.'
	};
	// ---------- inputs ----------
	(function () {
		var y = '<option value="">--</option>', m = '';
		for (var i = 2; i <= 19; i++) y += '<option value="' + i + '">' + i + '</option>';
		for (var j = 0; j <= 11; j++) m += '<option value="' + j + '">' + j + '</option>';
		$('kb-y').innerHTML = y; $('kb-m').innerHTML = m;
	})();
	function seg(id, val) { Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === val)); }); }
	function segClick(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; seg(id, b.getAttribute('data-v')); fn(b.getAttribute('data-v')); }); }
	segClick('kb-sex', function (v) { S.sex = v; exp = null; update(); });
	segClick('kb-mode', function (v) { S.mode = v; showMode(); update(); });
	function showMode() { $('kb-agerow').hidden = S.mode !== 'age'; $('kb-daterow').hidden = S.mode !== 'dates'; }
	['kb-y', 'kb-m', 'kb-birth', 'kb-on'].forEach(function (id) { $(id).addEventListener('change', update); $(id).addEventListener('input', update); });
	function fillFromKg() { var kg = num($('kb-kg').value); $('kb-lb').value = kg == null ? '' : r(KB.kgToLb(kg), 1); }
	function fillFromCm() { var cm = num($('kb-cm').value); if (cm == null) { $('kb-ft').value = ''; $('kb-in').value = ''; return; } var f = KB.cmToFtIn(cm); $('kb-ft').value = f[0]; $('kb-in').value = r(f[1], 1); }
	$('kb-kg').addEventListener('input', function () { fillFromKg(); update(); });
	$('kb-lb').addEventListener('input', function () { var lb = num($('kb-lb').value); $('kb-kg').value = lb == null ? '' : r(KB.lbToKg(lb), 2); update(); });
	$('kb-cm').addEventListener('input', function () { fillFromCm(); update(); });
	function fromFtIn() { var f = parseFloat($('kb-ft').value) || 0, i = num($('kb-in').value) || 0; $('kb-cm').value = f * 12 + i > 0 ? r(KB.ftInToCm(f, i), 1) : ''; update(); }
	$('kb-ft').addEventListener('input', fromFtIn); $('kb-in').addEventListener('input', fromFtIn);
	$('kb-clear').onclick = function () { ['kb-kg', 'kb-lb', 'kb-cm', 'kb-ft', 'kb-in', 'kb-birth'].forEach(function (id) { $(id).value = ''; }); $('kb-y').value = ''; $('kb-m').value = '0'; $('kb-on').value = todayIso(); exp = null; update(); toast('Cleared'); };
	// a few examples to try (made-up children)
	var EX = [['f', 6, 3, 21, 116], ['m', 10, 0, 34, 140], ['f', 14, 6, 50, 160], ['m', 17, 2, 70, 178]];
	$('kb-examples').innerHTML = EX.map(function (e, i) { return '<button type="button" class="tu-chip" data-ex="' + i + '">' + (e[0] === 'f' ? 'Girl' : 'Boy') + ', ' + e[1] + '</button>'; }).join('');
	$('kb-examples').addEventListener('click', function (ev) {
		var b = ev.target.closest('[data-ex]'); if (!b) return; var e = EX[+b.getAttribute('data-ex')];
		S.sex = e[0]; seg('kb-sex', S.sex); S.mode = 'age'; seg('kb-mode', 'age'); showMode(); $('kb-y').value = e[1]; $('kb-m').value = e[2];
		$('kb-kg').value = e[3]; fillFromKg(); $('kb-cm').value = e[4]; fillFromCm(); exp = null; update();
	});
	// ---------- results ----------
	var cur = null, exp = null;
	function ageMonths() {
		if (S.mode === 'age') { if ($('kb-y').value === '') return { err: '' }; return { m: KB.monthsFromYM(+$('kb-y').value, +$('kb-m').value) }; }
		var b = day($('kb-birth').value), o = day($('kb-on').value);
		if (b == null || o == null) return { err: '' }; if (o < b) return { err: 'The measurement date is before the birth date.' };
		return { m: KB.monthsFromDays(o - b) };
	}
	function update() {
		S.y = $('kb-y').value; S.m = $('kb-m').value; S.birth = $('kb-birth').value; S.on = $('kb-on').value; S.kg = $('kb-kg').value.trim(); S.cm = $('kb-cm').value.trim(); save();
		var a = ageMonths(), kg = num($('kb-kg').value), cm = num($('kb-cm').value), msg = '';
		cur = null;
		if (a.err) msg = a.err;
		else if (a.m != null) {
			var chk = KB.ageCheck(a.m);
			if (chk) msg = chk + (a.m < KB.MIN ? ' <a href="/baby-growth-percentile-calculator">Baby Growth Percentile Calculator &rarr;</a>' : ' <a href="/bmicalculator">Adult BMI Calculator &rarr;</a>');
			else if (kg != null && cm != null) {
				if (cm < 70 || cm > 230) msg = 'Check the height: that looks unlikely for a child or teen. Is the unit right?';
				else if (kg < 7 || kg > 250) msg = 'Check the weight: that looks unlikely for a child or teen. Is the unit right?';
				else cur = { months: a.m, kg: kg, cm: cm, A: KB.analyse(S.sex, a.m, kg, cm) };
			}
		}
		$('kb-msg').innerHTML = msg; $('kb-out').hidden = !cur; $('kb-empty').hidden = !!cur; $('kb-refbox').hidden = !cur;
		if (cur) render();
		drawChart();
	}
	function sexWord() { return S.sex === 'm' ? 'boys' : 'girls'; }
	function render() {
		var A = cur.A, c = A.cat;
		$('kb-hero').innerHTML =
			'<div class="tu-stat tu-stat--hero"><div class="tu-stat__label">BMI-for-age percentile</div><div class="tu-stat__value">' + esc(KB.pctText(A.pct)) + '</div><div class="tu-stat__sub">among ' + sexWord() + ' aged ' + esc(KB.ageText(cur.months)) + '</div></div>' +
			'<div class="tu-stat"><div class="tu-stat__label">Category</div><div class="tu-stat__value kb-cat kb-cat--' + c + '">' + NAMES[c] + '</div><div class="tu-stat__sub">' + esc(KB.CATS[c].range) + '</div></div>' +
			'<div class="tu-stat"><div class="tu-stat__label">BMI</div><div class="tu-stat__value">' + A.bmi.toFixed(1) + '</div><div class="tu-stat__sub">kg/m&sup2; &middot; ' + r(cur.kg, 2) + ' kg (' + r(KB.kgToLb(cur.kg), 1) + ' lb), ' + r(cur.cm, 1) + ' cm (' + ftin(cur.cm) + ')</div></div>';
		var extra = '';
		if (A.pct >= 85) extra = '<p class="kb-p95">BMI is <b>' + Math.round(A.pctOf95) + '%</b> of the 95th percentile (' + A.p95.toFixed(1) + ') for this age' + (A.cls3 ? ', which is in the range sometimes called class 3 (140% or more).' : '.') + '</p>';
		$('kb-verdict').innerHTML = '<p>' + TEXT[c] + '</p>' + extra;
		$('kb-verdict').className = 'tu-card kb-verdict kb-verdict--' + c;
		// percentile bar: 0-100 with the 5 / 85 / 95 marks
		var pos = Math.max(0.5, Math.min(99.5, A.pct));
		$('kb-bar').innerHTML = '<div class="kb-bar__track"><span class="kb-z kb-z--under" style="width:5%"></span><span class="kb-z kb-z--healthy" style="width:80%"></span><span class="kb-z kb-z--over" style="width:10%"></span><span class="kb-z kb-z--obese" style="width:5%"></span><span class="kb-bar__pin" style="left:' + pos + '%"></span></div>' +
			'<div class="kb-bar__ticks"><span style="left:5%">5th</span><span style="left:50%">50th</span><span style="left:85%">85th</span><span style="left:95%">95th</span></div>';
		var rows = [['5th percentile', A.p5, 'Below this: underweight'], ['50th percentile (median)', A.p50, 'Half of ' + sexWord() + ' this age are below'], ['85th percentile', A.p85, 'From here: overweight'], ['95th percentile', A.p95, 'From here: obesity'], ['120% of the 95th', A.sev, 'From here: severe obesity']];
		$('kb-ref').innerHTML = '<tr><th>Line</th><th>BMI</th><th>Meaning</th></tr>' + rows.map(function (x) { return '<tr' + (x[1] <= A.bmi && (x === rows[rows.length - 1] || rows[rows.indexOf(x) + 1][1] > A.bmi) ? ' class="kb-here"' : '') + '><td>' + x[0] + '</td><td>' + x[1].toFixed(1) + '</td><td>' + x[2] + '</td></tr>'; }).join('');
		$('kb-refnote').textContent = 'For ' + sexWord() + ' aged ' + KB.ageText(cur.months) + ' (CDC). Children are still growing, so a doctor looks at the trend over time rather than at one weight.';
	}
	function ftin(cm) { var f = KB.cmToFtIn(cm); return f[0] + '′ ' + r(f[1], 1) + '″'; }
	$('kb-copy').onclick = function () {
		if (!cur) return; var A = cur.A;
		var t = 'BMI-for-age: ' + KB.pctText(A.pct) + ' percentile (' + NAMES[A.cat] + ')\nBMI ' + A.bmi.toFixed(1) + ', ' + (S.sex === 'm' ? 'boy' : 'girl') + ', age ' + KB.ageText(cur.months) + '\n' + r(cur.kg, 2) + ' kg, ' + r(cur.cm, 1) + ' cm\n(CDC growth charts, mes.fm/bmi-calculator-kids)';
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('Copied'); }, function () { toast('Could not copy'); }); else toast('Could not copy');
	};
	$('kb-print').onclick = function () { window.print(); };
	// ---------- chart: BMI-for-age curves with the child's point; "Try other numbers" drags the point ----------
	var LINES = [5, 10, 25, 50, 75, 85, 90, 95];
	function chartGeom() {
		var box = $('kb-chart'), narrow = !!(box.clientWidth && box.clientWidth < 520), W = narrow ? 400 : 640, H = narrow ? 470 : 420, L = narrow ? 34 : 40, R = narrow ? 32 : 46, T = 12, B = 34;
		var ymin = 12, ymax = 36, pts = [];
		if (cur) pts.push(cur.A.bmi); if (exp) pts.push(exp.bmi);
		if (exp && exp.R) { ymin = exp.R[0]; ymax = exp.R[1]; }
		else pts.forEach(function (b) { if (b > ymax - 1) ymax = Math.min(60, Math.ceil((b + 3) / 2) * 2); if (b < ymin + 0.5) ymin = Math.max(8, Math.floor(b - 1)); });
		return { narrow: narrow, W: W, H: H, L: L, R: R, T: T, B: B, ymin: ymin, ymax: ymax, X: function (mo) { return L + (mo - 24) / 216 * (W - L - R); }, Y: function (b) { return T + (1 - (b - ymin) / (ymax - ymin)) * (H - T - B); } };
	}
	function drawChart() {
		var g = chartGeom(), X = g.X, Y = g.Y, s = S.sex, svg = '', mo, i;
		function curve(f) { var p = ''; for (mo = 24; mo <= 240; mo += 2) p += (mo === 24 ? 'M' : 'L') + X(mo).toFixed(1) + ' ' + Y(Math.max(g.ymin - 2, Math.min(g.ymax + 2, f(mo)))).toFixed(1); return p; }
		function area(f1, f2, cls) { var p = '', q = ''; for (mo = 24; mo <= 240; mo += 2) { p += (mo === 24 ? 'M' : 'L') + X(mo).toFixed(1) + ' ' + Y(clampY(f1(mo))).toFixed(1); } for (mo = 240; mo >= 24; mo -= 2) q += 'L' + X(mo).toFixed(1) + ' ' + Y(clampY(f2(mo))).toFixed(1); return '<path class="kb-reg kb-reg--' + cls + '" d="' + p + q + 'Z"/>'; }
		function clampY(b) { return Math.max(g.ymin, Math.min(g.ymax, b)); }
		var lo = function () { return g.ymin; }, hi = function () { return g.ymax; };
		var f5 = function (m) { return KB.bmiAt(s, m, 5); }, f85 = function (m) { return KB.bmiAt(s, m, 85); }, f95 = function (m) { return KB.p95(s, m); }, f120 = function (m) { return 1.2 * KB.p95(s, m); };
		svg += '<svg class="kb-svg' + (exp ? ' is-live' : '') + '" viewBox="0 0 ' + g.W + ' ' + g.H + '" role="img" aria-label="CDC BMI-for-age chart for ' + sexWord() + ' aged 2 to 20' + (cur ? ', with the child\'s BMI marked' : '') + '">';
		svg += '<defs><clipPath id="kb-clip"><rect x="' + g.L + '" y="' + g.T + '" width="' + (g.W - g.L - g.R) + '" height="' + (g.H - g.T - g.B) + '"/></clipPath></defs><g clip-path="url(#kb-clip)">';
		svg += area(lo, f5, 'under') + area(f5, f85, 'healthy') + area(f85, f95, 'over') + area(f95, f120, 'obese') + area(f120, hi, 'severe') + '</g>';
		for (var yr = 2; yr <= 20; yr++) { var x = X(yr * 12); svg += '<line class="kb-gl" x1="' + x + '" y1="' + g.T + '" x2="' + x + '" y2="' + (g.H - g.B) + '"/>' + (yr % 2 === 0 || !g.narrow ? '<text class="kb-ct" x="' + x + '" y="' + (g.H - g.B + 15) + '" text-anchor="middle">' + yr + '</text>' : ''); }
		svg += '<text class="kb-ct kb-axt" x="' + ((g.L + g.W - g.R) / 2) + '" y="' + (g.H - 3) + '" text-anchor="middle">Age (years)</text>';
		var step = g.ymax - g.ymin > 30 ? 4 : 2;
		for (var b = Math.ceil(g.ymin / step) * step; b <= g.ymax; b += step) svg += '<line class="kb-gl" x1="' + g.L + '" y1="' + Y(b) + '" x2="' + (g.W - g.R) + '" y2="' + Y(b) + '"/><text class="kb-ct" x="' + (g.L - 5) + '" y="' + (Y(b) + 4) + '" text-anchor="end">' + b + '</text>';
		svg += '<text class="kb-ct kb-axt" transform="translate(11 ' + ((g.T + g.H - g.B) / 2) + ') rotate(-90)" text-anchor="middle">BMI</text><g clip-path="url(#kb-clip)">';
		for (i = 0; i < LINES.length; i++) { (function (p) { svg += '<path class="kb-l' + (p === 50 ? ' kb-l50' : p === 5 || p === 85 || p === 95 ? ' kb-lcut' : '') + '" d="' + curve(function (m) { return KB.bmiAt(s, m, p); }) + '"/>'; })(LINES[i]); }
		svg += '<path class="kb-l kb-l120" d="' + curve(f120) + '"/></g>';
		var lastY = -99;
		LINES.concat([120]).forEach(function (p) {
			var b = p === 120 ? f120(240) : KB.bmiAt(s, 240, p); if (b < g.ymin || b > g.ymax) return; var y = Y(b);
			if (Math.abs(y - lastY) < 10 && p !== 95 && p !== 120 && p !== 85 && p !== 5) return; lastY = y;
			svg += '<text class="kb-pl" x="' + (g.W - g.R + 3) + '" y="' + (y + 4) + '">' + (p === 120 ? '120%' : p) + '</text>';
		});
		var pt = exp || (cur ? { months: cur.months, bmi: cur.A.bmi } : null);
		if (exp && cur) svg += '<circle class="kb-ghost" cx="' + X(cur.months) + '" cy="' + Y(clampY(cur.A.bmi)) + '" r="5"/>';
		if (pt) {
			var px = X(pt.months), py = Y(clampY(pt.bmi));
			svg += '<line class="kb-you-l" x1="' + px + '" y1="' + py + '" x2="' + px + '" y2="' + (g.H - g.B) + '"/><line class="kb-you-l" x1="' + g.L + '" y1="' + py + '" x2="' + px + '" y2="' + py + '"/><circle class="kb-you" cx="' + px + '" cy="' + py + '" r="' + (exp ? 9 : 7) + '"/>';
		}
		svg += '</svg>';
		var bar = '';
		if (cur) {
			bar = '<div class="kb-chartbar"><button type="button" class="tu-chip kb-try" aria-pressed="' + !!exp + '">&#9995; Try other numbers on the chart</button>';
			if (exp) {
				var P = KB.percentile(s, exp.months, exp.bmi), C = KB.category(s, exp.months, exp.bmi), moved = Math.abs(exp.months - cur.months) > 0.6 || Math.abs(exp.bmi - cur.A.bmi) > 0.05;
				bar += '<span class="kb-chartread" aria-live="polite"><b>Age ' + esc(KB.ageText(exp.months)) + '</b> &middot; <b>BMI ' + exp.bmi.toFixed(1) + '</b> &middot; ' + esc(KB.pctText(P)) + ' percentile, ' + NAMES[C] + '</span>';
				if (moved) bar += '<button type="button" class="tu-chip kb-use">Use these numbers</button><button type="button" class="tu-chip kb-back">&#8634; Back to my numbers</button>';
				else bar += '<span class="kb-charthint">Drag the dot or tap anywhere on the chart. The same BMI moves to a different percentile as a child gets older.</span>';
			}
			bar += '</div>';
		}
		$('kb-chart').innerHTML = bar + svg; $('kb-chart')._g = g;
	}
	(function () {
		var box = $('kb-chart'), drag = false;
		function at(e) {
			var svg = box.querySelector('svg'), g = box._g; if (!svg || !g || !exp) return;
			var rc = svg.getBoundingClientRect(), sx = (e.clientX - rc.left) / rc.width * g.W, sy = (e.clientY - rc.top) / rc.height * g.H;
			var mo = 24 + (sx - g.L) / (g.W - g.L - g.R) * 216, b = g.ymin + (1 - (sy - g.T) / (g.H - g.T - g.B)) * (g.ymax - g.ymin);
			mo = Math.max(24, Math.min(239.5, mo)); exp.months = Math.floor(mo) + 0.5; exp.bmi = Math.round(Math.max(g.ymin, Math.min(g.ymax, b)) * 10) / 10; drawChart();
		}
		box.addEventListener('click', function (e) {
			if (e.target.closest('.kb-try')) { exp = exp ? null : { months: cur.months, bmi: cur.A.bmi, R: [chartGeom().ymin, chartGeom().ymax] }; drawChart(); return; }
			if (e.target.closest('.kb-back')) { exp.months = cur.months; exp.bmi = cur.A.bmi; drawChart(); return; }
			if (e.target.closest('.kb-use')) {
				var k = exp, y = Math.floor(k.months / 12), m = Math.floor(k.months - y * 12);
				S.mode = 'age'; seg('kb-mode', 'age'); showMode(); $('kb-y').value = y; $('kb-m').value = m;
				$('kb-kg').value = r(k.bmi * cur.cm / 100 * cur.cm / 100, 1); fillFromKg(); exp = null; update(); exp = { months: cur.months, bmi: cur.A.bmi, R: k.R }; drawChart(); toast('Age and weight updated (same height)'); return;
			}
		});
		box.addEventListener('pointerdown', function (e) { if (!exp || !e.target.closest('svg')) return; drag = true; try { box.setPointerCapture(e.pointerId); } catch (x) {} at(e); e.preventDefault(); });
		box.addEventListener('pointermove', function (e) { if (drag) at(e); });
		function end() { drag = false; } box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
		if (window.ResizeObserver) { var w0 = 0; new ResizeObserver(function () { var w = box.clientWidth; if ((w < 520) !== (w0 < 520)) { w0 = w; drawChart(); } w0 = w; }).observe(box); }
	})();
	// ---------- start ----------
	seg('kb-sex', S.sex); seg('kb-mode', S.mode); showMode();
	$('kb-y').value = S.y; $('kb-m').value = S.m || '0'; $('kb-birth').value = S.birth; $('kb-on').value = S.on || todayIso();
	$('kb-kg').value = S.kg; fillFromKg(); $('kb-cm').value = S.cm; fillFromCm();
	update();
})();
