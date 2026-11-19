/* MES Space Shuttle Simulator: the Earth picture (drawn from Natural Earth land shapes, mes.fm/maps/data/countries-110m.json)
   used as the 3D globe's texture and as the flat ground-track map. window.SXMap. */
(function () {
	"use strict";
	if (typeof document === "undefined") return;
	var M = window.SXMap = {};
	var W = 2048, H = 1024, land = null, borders = null, tex = null, ready = null;

	function decode(topo) {
		var sc = topo.transform.scale, tr = topo.transform.translate;
		var arcs = topo.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (p) { x += p[0]; y += p[1]; return [x * sc[0] + tr[0], y * sc[1] + tr[1]]; }); });
		function ring(ids) {
			var out = [];
			ids.forEach(function (i, k) { var a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; out = out.concat(k ? a.slice(1) : a); });
			return out;
		}
		function polys(g) {
			if (g.type === "Polygon") return [g.arcs.map(ring)];
			if (g.type === "MultiPolygon") return g.arcs.map(function (p) { return p.map(ring); });
			return [];
		}
		var L = [], B = [];
		(topo.objects.land.geometries || [topo.objects.land]).forEach(function (g) { L = L.concat(polys(g)); });
		topo.objects.countries.geometries.forEach(function (g) { B = B.concat(polys(g)); });
		return { land: L, borders: B };
	}
	/* unwrap a ring's longitudes so it is continuous; a ring that goes all the way round (Antarctica) is closed along the pole */
	function unwrapRing(r) {
		var out = [], off = 0;
		for (var i = 0; i < r.length; i++) {
			if (i) { var d = r[i][0] - r[i - 1][0]; if (d > 180) off -= 360; else if (d < -180) off += 360; }
			out.push([r[i][0] + off, r[i][1]]);
		}
		var span = out[out.length - 1][0] - out[0][0];
		if (Math.abs(span) > 300) { var pole = out[0][1] < 0 ? -90 : 90; out.push([out[out.length - 1][0], pole], [out[0][0], pole]); }
		return out;
	}
	function pathRings(ctx, rings, w, h) {
		ctx.beginPath();
		[-360, 0, 360].forEach(function (shift) {
			rings.forEach(function (r) {
				var u = unwrapRing(r);
				u.forEach(function (p, i) { var x = (p[0] + shift + 180) / 360 * w, y = (90 - p[1]) / 180 * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
				ctx.closePath();
			});
		});
	}
	function paint() {
		var c = document.createElement("canvas"); c.width = W; c.height = H;
		var g = c.getContext("2d");
		var oc = g.createLinearGradient(0, 0, 0, H);
		oc.addColorStop(0, "#1b3a5c"); oc.addColorStop(0.18, "#13426e"); oc.addColorStop(0.5, "#0f4c80"); oc.addColorStop(0.82, "#13426e"); oc.addColorStop(1, "#1b3a5c");
		g.fillStyle = oc; g.fillRect(0, 0, W, H);
		var lg = g.createLinearGradient(0, 0, 0, H);
		[[0, "#eef3f6"], [0.15, "#e2e9ee"], [0.2, "#5d7a52"], [0.27, "#4f7444"], [0.33, "#8a8a5a"], [0.4, "#b9a273"], [0.46, "#5f8a45"], [0.54, "#4b7d3a"], [0.6, "#a8946a"], [0.67, "#7c8a55"], [0.74, "#55764a"], [0.81, "#dfe6ea"], [1, "#f4f7f9"]].forEach(function (s) { lg.addColorStop(s[0], s[1]); });
		g.fillStyle = lg;
		land.forEach(function (poly) { pathRings(g, poly, W, H); g.fill("evenodd"); });
		g.strokeStyle = "rgba(20,30,20,0.35)"; g.lineWidth = 1.2;
		borders.forEach(function (poly) { pathRings(g, poly, W, H); g.stroke(); });
		g.strokeStyle = "rgba(230,245,255,0.35)"; g.lineWidth = 1.5;
		land.forEach(function (poly) { pathRings(g, poly, W, H); g.stroke(); });
		return c;
	}
	M.load = function () {
		if (ready) return ready;
		ready = fetch("/maps/data/countries-110m.json").then(function (r) { if (!r.ok) throw new Error("map " + r.status); return r.json(); })
			.then(function (t) { var d = decode(t); land = d.land; borders = d.borders; tex = paint(); return tex; })
			.catch(function () { var c = document.createElement("canvas"); c.width = 512; c.height = 256; var g = c.getContext("2d"); g.fillStyle = "#0f4c80"; g.fillRect(0, 0, 512, 256); tex = c; return c; });
		return ready;
	};
	M.texture = function () { return tex; };

	/* night shading: a small picture recomputed when the sun has moved */
	var night = null, nightKey = "";
	function nightCanvas(sunLat, sunLon) {
		var key = Math.round(sunLat * 4) + ":" + Math.round(sunLon * 4);
		if (night && key === nightKey) return night;
		nightKey = key; night = night || document.createElement("canvas"); night.width = 360; night.height = 180;
		var g = night.getContext("2d"), img = g.createImageData(360, 180), sl = Math.sin(sunLat), cl = Math.cos(sunLat);
		for (var y = 0; y < 180; y++) {
			var lat = (89.5 - y) * Math.PI / 180, s = Math.sin(lat), c = Math.cos(lat);
			for (var x = 0; x < 360; x++) {
				var lon = (x - 179.5) * Math.PI / 180, el = s * sl + c * cl * Math.cos(lon - sunLon);
				var a = el > 0.05 ? 0 : el < -0.1 ? 150 : (0.05 - el) / 0.15 * 150, k = (y * 360 + x) * 4;
				img.data[k] = 2; img.data[k + 1] = 6; img.data[k + 2] = 20; img.data[k + 3] = a;
			}
		}
		g.putImageData(img, 0, 0);
		return night;
	}
	function xy(lat, lon, w, h) { return [(lon * 180 / Math.PI + 180) / 360 * w, (90 - lat * 180 / Math.PI) / 180 * h]; }
	M.xy = xy;
	/* polyline of {lat, lon} (rad), broken where it crosses the date line */
	M.track = function (ctx, pts, w, h) {
		ctx.beginPath(); var prev = null;
		for (var i = 0; i < pts.length; i++) {
			var p = xy(pts[i].lat, pts[i].lon, w, h);
			if (!prev || Math.abs(p[0] - prev[0]) > w / 2) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
			prev = p;
		}
		ctx.stroke();
	};
	M.base = function (ctx, w, h, sun) {
		if (tex) { ctx.imageSmoothingEnabled = true; ctx.drawImage(tex, 0, 0, w, h); } else { ctx.fillStyle = "#0f4c80"; ctx.fillRect(0, 0, w, h); }
		if (sun) ctx.drawImage(nightCanvas(sun.lat, sun.lon), 0, 0, w, h);
		ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.beginPath();
		for (var lo = -150; lo <= 150; lo += 30) { var x = (lo + 180) / 360 * w; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
		for (var la = -60; la <= 60; la += 30) { var y = (90 - la) / 180 * h; ctx.moveTo(0, y); ctx.lineTo(w, y); }
		ctx.stroke();
		ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
	};
})();
