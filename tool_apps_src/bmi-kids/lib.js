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
