/* MES Baby Growth: percentiles from the WHO Child Growth Standards (LMS method). Pure; node-testable. Needs WHO_LMS (data.js, prepended). Exposed as MESGrowth. */
var MESGrowth = (function () {
	'use strict';
	function D() { return typeof WHO_LMS !== 'undefined' ? WHO_LMS : require('./data.js'); }   // data.js is added after this file in the browser build, so look it up when needed
	var KINDS = { wfa: { label: 'Weight', unit: 'kg' }, lhfa: { label: 'Length / height', unit: 'cm' }, hcfa: { label: 'Head circumference', unit: 'cm' } };
	var MAXDAY = 1855;
	function lms(kind, sex, days) {
		var t = D()[kind][sex], d = Math.max(0, Math.min(MAXDAY, days)), f = d / 7, i = Math.floor(f), j = Math.min(t.length - 1, i + 1), w = f - i, a = t[i], b = t[j];
		return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
	}
	function zscore(kind, sex, days, x) { var p = lms(kind, sex, days), L = p[0], M = p[1], S = p[2]; return L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S); }
	function valueAt(kind, sex, days, z) { var p = lms(kind, sex, days), L = p[0], M = p[1], S = p[2]; return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L); }
	function cdf(z) { // Abramowitz-Stegun 26.2.17 (|error| < 7.5e-8)
		var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989422804014327 * Math.exp(-z * z / 2), p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
		return z > 0 ? 1 - p : p;
	}
	function percentile(kind, sex, days, x) { return cdf(zscore(kind, sex, days, x)) * 100; }
	function ageDays(birth, on, weeksEarly) { return (on - birth) - (weeksEarly > 0 && (on - birth) < 730 ? weeksEarly * 7 : 0); }
	function describe(z) {
		if (z < -3) return 'Far below the usual range. Please check with your doctor or health visitor.';
		if (z < -2) return 'Below the usual range (under the 3rd percentile). Worth mentioning to your doctor, especially if the trend is falling.';
		if (z < -1) return 'On the smaller side of the usual range. Perfectly normal if growth follows its own curve.';
		if (z <= 1) return 'Right in the middle of the usual range.';
		if (z <= 2) return 'On the larger side of the usual range. Perfectly normal if growth follows its own curve.';
		if (z <= 3) return 'Above the usual range (over the 97th percentile). Worth mentioning to your doctor, especially if the trend is rising fast.';
		return 'Far above the usual range. Please check with your doctor or health visitor.';
	}
	/* "bands" are the WHO lines at z = -2,-1,0,1,2; crossing two or more between visits is the pattern doctors look for */
	function band(z) { return z < -2 ? 0 : z < -1 ? 1 : z < 0 ? 2 : z < 1 ? 3 : z < 2 ? 4 : 5; }
	function crossing(zs) { if (zs.length < 2) return 0; return band(zs[zs.length - 1]) - band(zs[0]); }
	function pctText(p) { return p < 0.1 ? '<0.1' : p > 99.9 ? '>99.9' : p < 1 || p > 99 ? p.toFixed(1) : String(Math.round(p)); }
	function ordinal(n) { var s = String(n), v = Math.round(n) % 100; if (!/^\d+$/.test(s.replace('.', ''))) return s + 'th'; var r = Math.round(n); var x = r % 10; return r + (v >= 11 && v <= 13 ? 'th' : x === 1 ? 'st' : x === 2 ? 'nd' : x === 3 ? 'rd' : 'th'); }
	function lbOzToKg(lb, oz) { return (lb * 16 + oz) * 0.028349523125; }
	function kgToLbOz(kg) { var oz = kg / 0.028349523125, lb = Math.floor(oz / 16); return [lb, Math.round((oz - lb * 16) * 10) / 10]; }
	function ageText(days) { if (days < 0) return 'before the due date'; if (days < 14) return days + ' day' + (days === 1 ? '' : 's'); if (days < 84) return Math.floor(days / 7) + ' weeks' + (days % 7 ? ' ' + days % 7 + ' d' : ''); var m = Math.floor(days / 30.4375), r = Math.round(days - m * 30.4375); return m + ' month' + (m === 1 ? '' : 's') + (r > 0 ? ' ' + r + ' d' : ''); }
	return { KINDS: KINDS, MAXDAY: MAXDAY, lms: lms, zscore: zscore, valueAt: valueAt, percentile: percentile, cdf: cdf, ageDays: ageDays, describe: describe, band: band, crossing: crossing, pctText: pctText, ordinal: ordinal, lbOzToKg: lbOzToKg, kgToLbOz: kgToLbOz, ageText: ageText };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESGrowth;
