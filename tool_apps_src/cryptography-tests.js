/* node tool_apps_src/cryptography-tests.js */
var C = require("./cryptography/lib.js"), crypto = require("crypto"), fails = 0, n = 0;
function ok(c, m) { n++; if (!c) { fails++; console.log("FAIL", m); } }
function eq(a, b, m) { ok(String(a) === String(b), m + ": got " + a + " want " + b); }
var rnd = function (buf) { crypto.randomFillSync(buf); };

// classical
eq(C.caesar("Hello, World!", 3), "Khoor, Zruog!", "caesar"); eq(C.caesar("Khoor, Zruog!", 3, true), "Hello, World!", "caesar dec");
eq(C.rot13("Why did the chicken"), "Jul qvq gur puvpxra", "rot13"); eq(C.atbash("Wizard"), "Draziw", "atbash");
eq(C.affine("AFFINE CIPHER", 5, 8), "IHHWVC SWFRCP", "affine"); eq(C.affine("IHHWVC SWFRCP", 5, 8, true), "AFFINE CIPHER", "affine dec"); eq(C.affine("x", 13, 1), null, "affine bad a");
eq(C.vigenere("ATTACKATDAWN", "LEMON"), "LXFOPVEFRNHR", "vigenere"); eq(C.vigenere("LXFOPVEFRNHR", "LEMON", true), "ATTACKATDAWN", "vigenere dec");
eq(C.beaufort(C.beaufort("Defend the east", "FORTIFICATION"), "FORTIFICATION"), "Defend the east", "beaufort self-inverse");
eq(C.keywordAlphabet("ZEBRAS"), "ZEBRASCDFGHIJKLMNOPQTUVWXY", "keyword alphabet");
eq(C.substitute("FLEE AT ONCE", C.keywordAlphabet("ZEBRAS")), "SIAA ZQ LKBA", "substitute");
eq(C.substitute("SIAA ZQ LKBA", C.keywordAlphabet("ZEBRAS"), true), "FLEE AT ONCE", "substitute dec");
eq(C.railFence("WEAREDISCOVEREDFLEEATONCE", 3), "WECRLTEERDSOEEFEAOCAIVDEN", "rail fence"); eq(C.railFence("WECRLTEERDSOEEFEAOCAIVDEN", 3, true), "WEAREDISCOVEREDFLEEATONCE", "rail dec");
for (var r = 2; r < 8; r++) eq(C.railFence(C.railFence("Hello there, rail fence!", r), r, true), "Hello there, rail fence!", "rail round trip " + r);

// cracking
var plain = "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of light, it was the season of darkness.";
eq(C.crackCaesar(C.caesar(plain, 11))[0].k, 11, "crack caesar"); eq(C.crackCaesar(C.caesar("Meet me at noon", 7))[0].k, 7, "crack short caesar");
var af = C.crackAffine(C.affine(plain, 7, 4))[0]; eq(af.a + "," + af.b, "7,4", "crack affine");
var vg = C.crackVigenere(C.vigenere(plain + " " + plain.split("").reverse().join(""), "CIPHER")); eq(vg.key, "CIPHER", "crack vigenere"); eq(vg.len, 6, "vigenere length");
var ac = C.autoCrack(C.vigenere(plain, "KEY")); eq(ac.best.type, "vigenere", "auto vigenere"); eq(C.autoCrack(C.caesar(plain, 5)).best.type, "caesar", "auto caesar");
eq(C.autoCrack(C.atbash(plain)).best.type, "atbash", "auto atbash");
ok(C.ioc(C.counts(plain)) > 0.06, "english ioc"); ok(C.kasiski(C.vigenere(plain, "LEMON")).reps.length > 0, "kasiski reps");

// encoders
var b = C.utf8("Héllo ✓ 🙂"); eq(C.fromUtf8(C.fromB64(C.b64(b))), "Héllo ✓ 🙂", "b64 round"); eq(C.b64(C.utf8("Man")), "TWFu", "b64 Man"); eq(C.b64(C.utf8("Ma")), "TWE=", "b64 Ma");
eq(C.b64(b), Buffer.from("Héllo ✓ 🙂").toString("base64"), "b64 vs node"); eq(C.b64(Uint8Array.from([251, 255]), true), "-_8", "b64url");
eq(C.hex(C.utf8("AZ")), "415a", "hex"); eq(C.fromUtf8(C.fromHex("41 5a")), "AZ", "fromHex"); eq(C.fromHex("4g"), null, "bad hex");
eq(C.binary(C.utf8("A")), "01000001", "binary"); eq(C.fromUtf8(C.fromBinary("01001000 01101001")), "Hi", "fromBinary");
eq(C.morse("SOS help"), "... --- ... / .... . .-.. .--.", "morse"); eq(C.fromMorse("... --- ... / .... . .-.. .--."), "SOS HELP", "fromMorse");
eq(C.rot47(C.rot47("Hello 123!")), "Hello 123!", "rot47"); eq(C.rot47("Hello"), "w6==@", "rot47 value");
eq(C.hex(C.xor(C.xor(C.utf8("secret"), C.utf8("k")), C.utf8("k"))), C.hex(C.utf8("secret")), "xor round");

// hashes against node
["", "abc", "The quick brown fox jumps over the lazy dog", "a".repeat(1000), "héllo ✓ 🙂", "x".repeat(55), "x".repeat(56), "x".repeat(64)].forEach(function (s) {
	eq(C.sha256(s), crypto.createHash("sha256").update(s, "utf8").digest("hex"), "sha256 " + s.length);
	eq(C.md5(s), crypto.createHash("md5").update(s, "utf8").digest("hex"), "md5 " + s.length);
});
var big = new Uint8Array(200000); for (var i = 0; i < big.length; i++) big[i] = i * 31 & 255;
eq(C.sha256(big), crypto.createHash("sha256").update(big).digest("hex"), "sha256 big"); eq(C.crc32("123456789"), "cbf43926", "crc32");
var d = C.bitDiff(C.sha256("hello"), C.sha256("hellp")); ok(d > 90 && d < 166, "avalanche " + d);

// RSA
var k = C.rsaKey(61n, 53n, 17n); eq(k.n, 3233n, "n"); eq(k.phi, 3120n, "phi"); eq(k.d, 2753n, "d"); eq(C.modpowSteps(65n, 17n, 3233n).result, 2790n, "enc 65"); eq(C.modpowSteps(2790n, 2753n, 3233n).result, 65n, "dec");
ok(C.rsaKey(61n, 61n).err, "same primes"); ok(C.rsaKey(60n, 53n).err, "not prime"); ok(C.rsaKey(61n, 53n, 3n).err, "e shares factor with phi (3120 = 3 * ...)");
eq(C.rsaKey(61n, 53n).e, 257n, "default e");
var st = C.egcdSteps(3120n, 17n), last = st[st.length - 2]; eq(last.r, 1n, "egcd ends at 1"); eq(3120n * last.s + 17n * last.t, 1n, "bezout");
for (var bits = 16; bits <= 256; bits *= 2) {
	var p = C.randomPrime(bits, rnd), q = C.randomPrime(bits, rnd); if (p === q) continue; var key = C.rsaKey(p, q);
	ok(!key.err && (key.e * key.d) % key.phi === 1n, "keygen " + bits);
	var msg = "Hi MES! ✓ RSA test " + bits, tb = C.textToBlocks(msg, key.n), enc = tb.blocks.map(function (x) { return C.modpowSteps(x.m, key.e, key.n).result; });
	var dec = enc.map(function (c) { return C.modpowSteps(c, key.d, key.n).result; }); eq(C.blocksToText(dec, tb.k, tb.blocks[tb.blocks.length - 1].len), msg, "rsa text " + bits);
}
ok(C.textToBlocks("x", 200n).err, "n too small");
var cr = C.rsaCrack(3233n, 17n); ok(cr.ok && cr.key.d === 2753n, "crack small rsa");
var cr2 = C.rsaCrack(1000000016000000063n, 65537n); ok(cr2.ok, "crack 60-bit rsa");

// DH
eq(C.isPrimitiveRoot(5n, 23n), true, "5 root of 23"); eq(C.isPrimitiveRoot(2n, 23n), false, "2 not root of 23"); eq(C.smallestRoot(23n), 5n, "smallest root 23");
var dh = C.dh(23n, 5n, 6n, 15n); eq(dh.A, 8n, "A"); eq(dh.B, 19n, "B"); eq(dh.sA, 2n, "secret"); eq(dh.sB, 2n, "secret B");
var dl = C.dlog(5n, 8n, 23n); eq(C.modpowSteps(5n, dl.x, 23n).result, 8n, "dlog small");
var dl2 = C.dlog(2n, C.modpowSteps(2n, 123456789n, 1000000007n).result, 1000000007n); eq(C.modpowSteps(2n, dl2.x, 1000000007n).result, C.modpowSteps(2n, 123456789n, 1000000007n).result, "dlog 1e9");

// MES1 format
var salt = new Uint8Array(16).fill(1), iv = new Uint8Array(12).fill(2), ct = new Uint8Array(40).fill(3), s = C.pack(salt, iv, ct), u = C.unpack(s);
ok(s.indexOf("MES1.") === 0, "pack prefix"); eq(C.hex(u.salt) + C.hex(u.iv) + C.hex(u.ct), C.hex(salt) + C.hex(iv) + C.hex(ct), "unpack"); eq(C.unpack("hello"), null, "unpack junk");
eq(Math.round(C.passwordSpace("abc123").bits), 31, "pw bits");

console.log(n + " checks, " + fails + " failed"); process.exit(fails ? 1 : 0);
