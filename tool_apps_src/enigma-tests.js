// node tool_apps_src/enigma-tests.js -- MES Enigma maths: known vectors, stepping, reciprocity, M4 = M3 equivalence, crib search.
const assert = require('assert'); const EN = require('./enigma/lib.js');
let n = 0; const ok = (f) => { f(); n++; };
const cfg = (o) => Object.assign(EN.defaults('M3'), o);
const enc = (c, t) => EN.run(c, t).text;
ok(() => assert.strictEqual(enc(cfg({}), 'AAAAA'), 'BDZGO'));                       // the classic: I II III, B, AAA, AAA
ok(() => assert.strictEqual(enc(cfg({}), 'BDZGO'), 'AAAAA'));                       // reciprocal
// stepping incl. the middle rotor's double step: I II III at ADU -> ADV -> AEW -> BFX -> BFY
ok(() => { let p = EN.posParse('ADU', 3); const names = ['I', 'II', 'III'], seen = []; for (let i = 0; i < 4; i++) { p = EN.step(p, names); seen.push(EN.posText(p)); } assert.deepStrictEqual(seen, ['ADV', 'AEW', 'BFX', 'BFY']); });
// never maps a letter to itself, 5,000 random letters
ok(() => { const t = Array.from({ length: 5000 }, (_, i) => EN.A[(i * 7 + (i >> 3)) % 26]).join(''); const c = EN.random('M3', () => 0.37); const o = enc(c, t); for (let i = 0; i < t.length; i++) assert.notStrictEqual(o[i], t[i]); assert.strictEqual(enc(c, o), t); });
// plugboard, rings, M3 rotors VI-VIII (two notches) round trip; M4 round trip
ok(() => { let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; ['I', 'M3', 'M4'].forEach((m) => { for (let k = 0; k < 30; k++) { const c = EN.random(m, rnd); const t = 'THEQUICKBROWNFOXJUMPSOVERTHELAZYDOGWETTERBERICHT'.repeat(5); assert.strictEqual(enc(c, enc(c, t)), t); } }); });
// M4 with Beta / Gamma at A, ring A and a thin reflector behaves like an M3 with reflector B / C
ok(() => { const t = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(30); const m3 = cfg({ rotors: ['IV', 'II', 'VIII'], rings: [3, 5, 9], pos: [2, 4, 6] });
	const m4 = { model: 'M4', rotors: ['Beta', 'IV', 'II', 'VIII'], rings: [0, 3, 5, 9], pos: [0, 2, 4, 6], refl: 'B-thin', plugs: '' }; assert.strictEqual(enc(m3, t), enc(m4, t));
	const c3 = cfg({ refl: 'C' }), c4 = { model: 'M4', rotors: ['Gamma', 'I', 'II', 'III'], rings: [0, 0, 0, 0], pos: [0, 0, 0, 0], refl: 'C-thin', plugs: '' }; assert.strictEqual(enc(c3, t), enc(c4, t)); });
// every rotor and reflector is a valid permutation / a fixed-point-free involution
ok(() => { Object.keys(EN.ROTORS).forEach((r) => assert.strictEqual([...EN.ROTORS[r][0]].sort().join(''), EN.A)); Object.keys(EN.REFLECTORS).forEach((r) => { const w = EN.REFLECTORS[r]; assert.strictEqual([...w].sort().join(''), EN.A); for (let i = 0; i < 26; i++) { const j = EN.A.indexOf(w[i]); assert.notStrictEqual(j, i); assert.strictEqual(w[j], EN.A[i]); } }); });
// plugboard parsing
ok(() => { assert.deepStrictEqual(EN.parsePlugs('ab cd, ef').pairs, ['AB', 'CD', 'EF']); assert(EN.parsePlugs('AB BC').error); assert(EN.parsePlugs('AA').error); assert(EN.parsePlugs('ABC').error); assert(EN.parsePlugs('AB CD EF GH IJ KL MN OP QR ST UV').error); });
ok(() => { const c = cfg({ plugs: 'AB CD' }); assert.strictEqual(enc(c, 'HELLO'), enc(cfg({ plugs: 'CD AB' }), 'HELLO')); assert.notStrictEqual(enc(c, 'HELLO'), enc(cfg({}), 'HELLO')); });
// keep = pass spaces / punctuation through but do not step on them
ok(() => { const c = cfg({}); assert.strictEqual(EN.run(c, 'AAA AA', { keep: true }).text, 'BDZ GO'); });
// normalize
ok(() => { const c = EN.normalize({ model: 'M3', rotors: ['I', 'I', 'III'], refl: 'A', rings: [30, 1, 2], pos: [1, 2, 3], plugs: 'AB AB' }); assert.deepStrictEqual(c.rotors, ['I', 'II', 'III']); assert.strictEqual(c.refl, 'B'); assert.strictEqual(c.rings[0], 0); assert.strictEqual(c.plugs, ''); assert.deepStrictEqual(EN.normalize({ model: 'M4', rotors: ['Gamma', 'V', 'VI', 'VII'], refl: 'C-thin' }).rotors, ['Gamma', 'V', 'VI', 'VII']); assert.deepStrictEqual(EN.normalize({ model: 'M3', rotors: ['Beta', 'I', 'II'] }).rotors, ['I', 'II', 'III']); });
// crib search finds the secret start position (and, with orders, the rotor order)
ok(() => { const c = cfg({ rotors: ['V', 'II', 'IV'], rings: [1, 2, 3], pos: EN.posParse('QXE', 3), plugs: 'AB CD' }); const plain = 'XXWETTERBERICHTXXNULLEINSNULL', ct = enc(c, plain);
	const s = EN.cribSearch(Object.assign({}, c, { pos: [0, 0, 0] }), ct, 'WETTERBERICHT', { offsets: [2] }); let r; do { r = s.next(1000); } while (!r.done); assert(r.hits.some((h) => EN.posText(h.pos) === 'QXE' && h.offset === 2)); assert(r.hits.length <= 3);
	const s2 = EN.cribSearch(Object.assign({}, c, { pos: [0, 0, 0] }), ct, 'WETTERBERICHT', { offsets: [2], orders: true }); do { r = s2.next(2000); } while (!r.done); assert(r.hits.some((h) => h.rotors.join() === 'V,II,IV' && EN.posText(h.pos) === 'QXE')); assert.strictEqual(r.total, 336 * 17576); });
ok(() => { const o = EN.cribOffsets('ABCDE', 'BXD'); assert.deepStrictEqual(o, [0, 2].filter((x) => true).filter((x) => 'ABCDE'.substr(x, 3).split('').every((ch, i) => ch !== 'BXD'[i]))); });
console.log('enigma: ' + n + ' groups passed');
