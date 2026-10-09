/* MES Photoelectric Effect Simulator -- physics (browser + node: require('./tool_apps_src/photoelectric-effect-simulator/lib.js')).
 * E = h f = h c / lambda;  KE_max = h f - phi (zero below threshold);  V_stop = KE_max / e;  f0 = phi / h.  Energies in eV, constants CODATA 2018 (exact SI). */
(function (root) {
	"use strict";
	var H = 6.62607015e-34, C = 299792458, E = 1.602176634e-19, ME = 9.1093837015e-31;
	var HC_EVNM = H * C / E * 1e9;   // 1239.84198 eV nm
	/* typical textbook work functions (eV); real values depend on the surface and crystal face */
	var METALS = [
		{ id: "cs", name: "Caesium (Cs)", phi: 2.14, color: "#d8b45a" }, { id: "rb", name: "Rubidium (Rb)", phi: 2.16, color: "#c9a96a" },
		{ id: "k", name: "Potassium (K)", phi: 2.30, color: "#c8c8d0" }, { id: "na", name: "Sodium (Na)", phi: 2.75, color: "#d6d6dc" },
		{ id: "ca", name: "Calcium (Ca)", phi: 2.87, color: "#bfc3c9" }, { id: "mg", name: "Magnesium (Mg)", phi: 3.66, color: "#cfd3d8" },
		{ id: "al", name: "Aluminium (Al)", phi: 4.08, color: "#c7ccd3" }, { id: "ag", name: "Silver (Ag)", phi: 4.26, color: "#e1e4e8" },
		{ id: "zn", name: "Zinc (Zn)", phi: 4.33, color: "#aeb6bf" }, { id: "fe", name: "Iron (Fe)", phi: 4.50, color: "#9aa0a8" },
		{ id: "cu", name: "Copper (Cu)", phi: 4.65, color: "#d08a5a" }, { id: "au", name: "Gold (Au)", phi: 5.10, color: "#e0b94a" },
		{ id: "pt", name: "Platinum (Pt)", phi: 5.65, color: "#d4d8dc" }
	];
	var MBY = {}; METALS.forEach(function (m) { MBY[m.id] = m; });
	function energyFromWavelength(nm) { return HC_EVNM / nm; }                 // eV
	function wavelengthFromEnergy(eV) { return HC_EVNM / eV; }                 // nm
	function freqFromWavelength(nm) { return C / (nm * 1e-9); }                // Hz
	function energyFromFreq(f) { return H * f / E; }                            // eV
	function ke(nm, phi) { return Math.max(0, energyFromWavelength(nm) - phi); }
	function threshold(phi) { return { f: phi * E / H, nm: wavelengthFromEnergy(phi) }; }
	function speed(keEv) { return Math.sqrt(2 * keEv * E / ME); }               // m/s, non-relativistic (fine for a few eV)
	/* idealised photocurrent vs collector voltage as a fraction of the saturation current: zero at and below -V0, rising smoothly, 1 for large positive V */
	function iv(V, v0) {
		if (v0 <= 0) return V >= 0 ? 1 : 0;
		if (V <= -v0) return 0;
		var x = (V + v0) / (v0 + 1.5); return Math.pow(Math.min(1, x), 1.7);
	}
	/* wavelength (nm) -> approximate sRGB for the screen; ultraviolet shown violet-grey, infrared deep red */
	function wlColor(nm) {
		var r = 0, g = 0, b = 0;
		if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490 && nm >= 440) { g = (nm - 440) / 50; b = 1; } else if (nm < 510 && nm >= 490) { g = 1; b = -(nm - 510) / 20; }
		else if (nm < 580 && nm >= 510) { r = (nm - 510) / 70; g = 1; } else if (nm < 645 && nm >= 580) { r = 1; g = -(nm - 645) / 65; } else if (nm >= 645 && nm <= 780) r = 1;
		var f = nm < 380 ? 1 : nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
		if (nm < 380) { r = 0.62; g = 0.4; b = 1; f = 0.9 - 0.3 * Math.min(1, (380 - nm) / 280); }
		if (nm > 780) { r = 0.55; g = 0; b = 0; f = 0.8; }
		function c(x) { return Math.round(255 * Math.pow(Math.max(0, x * f), 0.8)); }
		return "rgb(" + c(r) + "," + c(g) + "," + c(b) + ")";
	}
	/* least-squares line y = a x + b; returns slope a, intercept b, r2 */
	function fit(pts) {
		var n = pts.length; if (n < 2) return null; var sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, i;
		for (i = 0; i < n; i++) { sx += pts[i][0]; sy += pts[i][1]; sxx += pts[i][0] * pts[i][0]; sxy += pts[i][0] * pts[i][1]; syy += pts[i][1] * pts[i][1]; }
		var d = n * sxx - sx * sx; if (Math.abs(d) < 1e-300) return null;
		var a = (n * sxy - sx * sy) / d, b = (sy - a * sx) / n, ssTot = syy - sy * sy / n, ssRes = 0;
		for (i = 0; i < n; i++) { var e = pts[i][1] - (a * pts[i][0] + b); ssRes += e * e; }
		return { a: a, b: b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
	}
	var API = { H: H, C: C, E: E, ME: ME, HC_EVNM: HC_EVNM, METALS: METALS, MBY: MBY, energyFromWavelength: energyFromWavelength, wavelengthFromEnergy: wavelengthFromEnergy, freqFromWavelength: freqFromWavelength, energyFromFreq: energyFromFreq, ke: ke, threshold: threshold, speed: speed, iv: iv, wlColor: wlColor, fit: fit };
	if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MESPhoto = API;
})(typeof window !== "undefined" ? window : globalThis);
