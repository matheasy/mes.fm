var E = require('./exif-viewer/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); } }
/* build a little-endian TIFF with IFD0 (make, orientation, exif ptr, gps ptr), Exif (fnumber, iso, exposure time) and GPS (N 49 17 3, W 123 7 12) */
function build() {
	var b = [], bytes = []; function w16(o, v) { bytes[o] = v & 255; bytes[o + 1] = v >> 8; } function w32(o, v) { w16(o, v & 65535); w16(o + 2, v >>> 16); }
	function entry(o, tag, type, count, v) { w16(o, tag); w16(o + 2, type); w32(o + 4, count); w32(o + 8, v); }
	bytes[0] = 0x49; bytes[1] = 0x49; w16(2, 42); w32(4, 8);
	var ifd0 = 8; w16(ifd0, 4); // make (ASCII at 200), orientation, exif ptr, gps ptr
	entry(ifd0 + 2, 0x010F, 2, 6, 200); entry(ifd0 + 14, 0x0112, 3, 1, 6); entry(ifd0 + 26, 0x8769, 4, 1, 100); entry(ifd0 + 38, 0x8825, 4, 1, 140); w32(ifd0 + 50, 0);
	'Canon\0'.split('').forEach(function (c, i) { bytes[200 + i] = c.charCodeAt(0); });
	w16(100, 3); entry(102, 0x829D, 5, 1, 220); entry(114, 0x8827, 3, 1, 400); entry(126, 0x829A, 5, 1, 230); w32(138, 0);   // would run into 140: keep IFD sizes in mind
	return { bytes: bytes, w16: w16, w32: w32, entry: entry };
}
var t = build(), B = t.bytes;
// rationals: fnumber 28/10, exposure 1/250
t.w32(220, 28); t.w32(224, 10); t.w32(230, 1); t.w32(234, 250);
// GPS IFD at 140 (5 entries -> 2 + 60 + 4 = 66 bytes, ends 206; make string at 200 would clash, so move make)
// move make string to 300
for (var i = 0; i < 6; i++) B[300 + i] = 'Canon\0'.charCodeAt(i); t.entry(8 + 2, 0x010F, 2, 6, 300);
t.w16(140, 4); t.entry(142, 1, 2, 2, 'N'.charCodeAt(0)); t.entry(154, 2, 5, 3, 240); t.entry(166, 3, 2, 2, 'W'.charCodeAt(0)); t.entry(178, 4, 5, 3, 270); t.w32(190, 0);
[49, 1, 17, 1, 3, 1].forEach(function (v, k) { t.w32(240 + k * 4, v); }); [123, 1, 7, 1, 12, 1].forEach(function (v, k) { t.w32(270 + k * 4, v); });
for (i = 0; i < B.length; i++) if (B[i] == null) B[i] = 0;
var tiff = B, exif = [0x45, 0x78, 0x69, 0x66, 0, 0].concat(tiff), len = exif.length + 2;
var jpg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, len >> 8, len & 255].concat(exif).concat([0xFF, 0xD9]));
var r = E.parse(jpg);
eq(r.format, 'JPEG', 'format'); eq(r.hasExif, true, 'has exif');
function get(name) { var x = r.rows.filter(function (q) { return q.name === name; })[0]; return x && x.value; }
eq(get('Camera make'), 'Canon', 'make'); eq(get('Orientation'), 'Rotated 90° right', 'orientation'); eq(get('Aperture (f-number)'), 'f/2.8', 'fnumber'); eq(get('Exposure time'), '1/250 s', 'exposure'); eq(get('ISO'), '400', 'iso');
eq(r.orientation, 6, 'orientation raw');
eq(Math.round(r.gps.lat * 1e4) / 1e4, 49.2842, 'latitude'); eq(Math.round(r.gps.lon * 1e4) / 1e4, -123.12, 'longitude west is negative');
eq(r.flags[0].indexOf('GPS') > 0, true, 'GPS flag');
eq(r.rows.filter(function (q) { return /ref$/.test(q.name); }).length, 0, 'ref rows hidden');
eq(E.parse(new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9])).hasExif, false, 'jpeg without exif');
eq(E.parse(new Uint8Array([1, 2, 3, 4])).format, 'Unknown', 'unknown');
eq(E.parse(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])).format, 'HEIC', 'heic detected');
eq(E.fmtValue('Exposure time', 2), '2 s', 'long exposure'); eq(E.fmtValue('Exposure bias', -0.33333), '-0.33 EV', 'bias');
// corrupted offsets must not throw
var bad = jpg.slice(); for (i = 20; i < 60; i++) bad[i] = 0xFF; var threw = false; try { E.parse(bad); } catch (e) { threw = true; } eq(threw, false, 'corrupt data does not throw');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
