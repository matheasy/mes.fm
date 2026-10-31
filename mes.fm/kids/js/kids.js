/* MES Kids (tool_apps_src/kids): pure data + logic, no DOM. Runs in node for the tests (tool_apps_src/kids-tests.js).
   window.MESKids = { CATS, ITEMS, SOUNDS, MODES, deck, shuffle, rng, quizChoices, caseWord, speakText, soundFor, filterVoices, ... } */
(function (root) {
	"use strict";

	// ---------- Categories ----------
	var CATS = [
		{ id: "animals", name: "Animals", icon: "🐶" },
		{ id: "colours", name: "Colours", icon: "🎨" },
		{ id: "shapes", name: "Shapes", icon: "🔺" },
		{ id: "letters", name: "Letters", icon: "🔤" },
		{ id: "numbers", name: "Numbers", icon: "🔢" },
		{ id: "food", name: "Food", icon: "🍎" },
		{ id: "things", name: "Things", icon: "🧸" },
		{ id: "vehicles", name: "Vehicles", icon: "🚗" },
		{ id: "body", name: "Body", icon: "👋" }
	];

	// ---------- Animal sound recordings (all public domain or CC0, from Wikimedia Commons; trimmed + loudness-matched MP3s in /kids/sounds/) ----------
	// [file id, Commons file name, Commons page, author, licence]
	var SOUNDS = {
		dog: ["George vuf 1996.ogg", "https://commons.wikimedia.org/wiki/File:George_vuf_1996.ogg", "Broadbeer", "Public domain", "one bark, played twice"],
		cat: ["Meow of a Siamese cat - freemaster2.wav", "https://commons.wikimedia.org/wiki/File:Meow_of_a_Siamese_cat_-_freemaster2.wav", "freemaster2", "CC0"],
		rooster: ["Medium rooster crowing.ogg", "https://commons.wikimedia.org/wiki/File:Medium_rooster_crowing.ogg", "alys", "Public domain"],
		chicken: ["Hen announcing shes lain an egg.ogg", "https://commons.wikimedia.org/wiki/File:Hen_announcing_shes_lain_an_egg.ogg", "alys", "Public domain"],
		sheep: ["Sheep bleating.ogg", "https://commons.wikimedia.org/wiki/File:Sheep_bleating.ogg", "earthcalling", "Public domain"],
		goat: ["Herd of goats bleating.ogg", "https://commons.wikimedia.org/wiki/File:Herd_of_goats_bleating.ogg", "stephan", "Public domain"],
		horse: ["Wiehern.ogg", "https://commons.wikimedia.org/wiki/File:Wiehern.ogg", "Hü.", "Public domain"],
		duck: ["Ducks snatching.ogg", "https://commons.wikimedia.org/wiki/File:Ducks_snatching.ogg", "Bert76", "CC0"],
		pig: ["618483 foleyhaven piglet-squeal-01.flac", "https://commons.wikimedia.org/wiki/File:618483_foleyhaven_piglet-squeal-01.flac", "Foleyhaven (freesound.org)", "CC0", "a piglet squealing"],
		elephant: ["Elephant voice - trumpeting.ogg", "https://commons.wikimedia.org/wiki/File:Elephant_voice_-_trumpeting.ogg", "தகவலுழவன் (Thagaval uzhavan)", "CC0"],
		lion: ["Lion raring-sound1TamilNadu178.ogg", "https://commons.wikimedia.org/wiki/File:Lion_raring-sound1TamilNadu178.ogg", "த*உழவன் (Tha.Uzhavan)", "Public domain"],
		bear: ["Yellowstone sound library - Grizzly Bears Roar - 001.mp3", "https://commons.wikimedia.org/wiki/File:Yellowstone_sound_library_-_Grizzly_Bears_Roar_-_001.mp3", "NPS & MSU Acoustic Atlas / Jennifer Jerrett", "Public domain"],
		wolf: ["Wolf howls.ogg", "https://commons.wikimedia.org/wiki/File:Wolf_howls.ogg", "not named (see the file page)", "Public domain"],
		owl: ["Barred Owl, Yellowstone National Park.oga", "https://commons.wikimedia.org/wiki/File:Barred_Owl,_Yellowstone_National_Park.oga", "National Park Service", "Public domain"],
		frog: ["Edible frogs, sounds. May. The Village of Krzemienica, Łódź Voivodeship, Poland.ogg", "https://commons.wikimedia.org/wiki/File:Edible_frogs,_sounds._May._The_Village_of_Krzemienica,_%C5%81%C3%B3d%C5%BA_Voivodeship,_Poland.ogg", "WrS.tm.pl", "Public domain"],
		bee: ["Bombus buzz.ogg", "https://commons.wikimedia.org/wiki/File:Bombus_buzz.ogg", "Mysid", "Public domain", "a bumblebee"],
		whale: ["Humpbackwhale2.ogg", "https://commons.wikimedia.org/wiki/File:Humpbackwhale2.ogg", "Spyrogumas", "CC0", "humpback whale song"],
		dove: ["Dove cooing.ogg", "https://commons.wikimedia.org/wiki/File:Dove_cooing.ogg", "mary905", "Public domain"],
		goose: ["Geese Honking (loud).ogg", "https://commons.wikimedia.org/wiki/File:Geese_Honking_(loud).ogg", "U.S. Fish and Wildlife Service", "Public domain"],
		turkey: ["Gobbler.ogg", "https://commons.wikimedia.org/wiki/File:Gobbler.ogg", "bod", "Public domain"],
		crow: ["Common Raven.ogg", "https://commons.wikimedia.org/wiki/File:Common_Raven.ogg", "G. McGrane", "Public domain", "a common raven"],
		peacock: ["Pavo cristatus (call).ogg", "https://commons.wikimedia.org/wiki/File:Pavo_cristatus_(call).ogg", "Ke4roh", "Public domain"],
		bison: ["Bison.ogg", "https://commons.wikimedia.org/wiki/File:Bison.ogg", "National Park Service", "Public domain"],
		deer: ["American Elk Bugling.ogg", "https://commons.wikimedia.org/wiki/File:American_Elk_Bugling.ogg", "Jim Pisarowicz", "Public domain", "an elk (a big deer) bugling"],
		eagle: ["Bald Eagle Yellowstone National Park.ogg", "https://commons.wikimedia.org/wiki/File:Bald_Eagle_Yellowstone_National_Park.ogg", "National Park Service", "Public domain"],
		snake: ["Rattlesnake.ogg", "https://commons.wikimedia.org/wiki/File:Rattlesnake.ogg", "not named (see the file page)", "Public domain", "a rattlesnake's rattle"],
		cricket: ["Grasshoppers.ogg", "https://commons.wikimedia.org/wiki/File:Grasshoppers.ogg", "Mysid", "Public domain", "grasshoppers chirping, like a cricket"],
		crocodile: ["Alligatorbellow1.ogg", "https://commons.wikimedia.org/wiki/File:Alligatorbellow1.ogg", "not named (see the file page)", "Public domain", "an alligator (a cousin of the crocodile) bellowing"],
		bird: ["American Robin Yellowstone National Park.ogg", "https://commons.wikimedia.org/wiki/File:American_Robin_Yellowstone_National_Park.ogg", "National Park Service", "Public domain", "an American robin singing"],
		monkey: ["Hylobates syndactylus calling 3588.ogg", "https://commons.wikimedia.org/wiki/File:Hylobates_syndactylus_calling_3588.ogg", "Dori", "Public domain", "siamangs calling (an ape, a cousin of monkeys)"]
	};

	// ---------- Items ----------
	// pic: an emoji, or "svg:<shape>" / "col:<#hex>" drawn by the page. say = what is spoken (defaults to word). sw = sound word.
	var ITEMS = [];
	function add(cat, list) { list.forEach(function (a) { var o = { cat: cat, id: cat + ":" + a[0], key: a[0], word: a[1], pic: a[2] }; if (a[3]) for (var k in a[3]) o[k] = a[3][k]; ITEMS.push(o); }); }

	add("animals", [
		["dog", "Dog", "🐶", { sw: "Woof woof", snd: "dog" }], ["cat", "Cat", "🐱", { sw: "Meow", snd: "cat" }], ["cow", "Cow", "🐮", { sw: "Moo" }],
		["pig", "Pig", "🐷", { sw: "Oink oink", snd: "pig" }], ["sheep", "Sheep", "🐑", { sw: "Baa", snd: "sheep" }], ["goat", "Goat", "🐐", { sw: "Maa", snd: "goat" }],
		["horse", "Horse", "🐴", { sw: "Neigh", snd: "horse" }], ["chicken", "Chicken", "🐔", { sw: "Cluck cluck", snd: "chicken" }],
		["rooster", "Rooster", "🐓", { sw: "Cock-a-doodle-doo", snd: "rooster" }], ["duck", "Duck", "🦆", { sw: "Quack quack", snd: "duck" }],
		["goose", "Goose", "🪿", { sw: "Honk honk", snd: "goose" }], ["turkey", "Turkey", "🦃", { sw: "Gobble gobble", snd: "turkey" }],
		["owl", "Owl", "🦉", { sw: "Hoo hoo", snd: "owl" }], ["crow", "Raven", "🐦‍⬛", { sw: "Caw caw", snd: "crow" }], ["dove", "Dove", "🕊️", { sw: "Coo coo", snd: "dove" }],
		["bird", "Bird", "🐦", { sw: "Tweet tweet", snd: "bird" }], ["peacock", "Peacock", "🦚", { sw: "Ee-awe", snd: "peacock" }], ["eagle", "Eagle", "🦅", { sw: "Kee kee", snd: "eagle" }],
		["frog", "Frog", "🐸", { sw: "Ribbit", snd: "frog" }], ["bee", "Bee", "🐝", { sw: "Buzz", snd: "bee" }], ["cricket", "Cricket", "🦗", { sw: "Chirp chirp", snd: "cricket" }],
		["elephant", "Elephant", "🐘", { sw: "Toot toot", snd: "elephant" }], ["lion", "Lion", "🦁", { sw: "Roar", snd: "lion" }], ["tiger", "Tiger", "🐯", { sw: "Roar" }],
		["bear", "Bear", "🐻", { sw: "Grrr", snd: "bear" }], ["wolf", "Wolf", "🐺", { sw: "Awoooo", snd: "wolf" }], ["monkey", "Monkey", "🐒", { sw: "Hoo hoo hoo", snd: "monkey" }],
		["whale", "Whale", "🐋", { sw: "Oooooo", snd: "whale" }], ["bison", "Bison", "🦬", { sw: "Hmmph", snd: "bison" }], ["deer", "Deer", "🦌", { sw: "Eee-ooo", snd: "deer" }],
		["snake", "Snake", "🐍", { sw: "Hiss", snd: "snake" }], ["crocodile", "Crocodile", "🐊", { sw: "Rumble", snd: "crocodile" }], ["mouse", "Mouse", "🐭", { sw: "Squeak squeak" }],
		["rabbit", "Rabbit", "🐰"], ["fish", "Fish", "🐟"], ["turtle", "Turtle", "🐢"], ["giraffe", "Giraffe", "🦒"], ["zebra", "Zebra", "🦓"],
		["penguin", "Penguin", "🐧"], ["butterfly", "Butterfly", "🦋"], ["octopus", "Octopus", "🐙"], ["fox", "Fox", "🦊"]
	]);
	add("colours", [
		["red", "Red", "col:#e53935"], ["orange", "Orange", "col:#fb8c00"], ["yellow", "Yellow", "col:#fdd835"], ["green", "Green", "col:#43a047"],
		["blue", "Blue", "col:#1e88e5"], ["purple", "Purple", "col:#8e24aa"], ["pink", "Pink", "col:#f06292"], ["brown", "Brown", "col:#795548"],
		["black", "Black", "col:#111111"], ["white", "White", "col:#ffffff"], ["grey", "Grey", "col:#9e9e9e"]
	]);
	add("shapes", [
		["circle", "Circle", "svg:circle"], ["square", "Square", "svg:square"], ["triangle", "Triangle", "svg:triangle"], ["rectangle", "Rectangle", "svg:rectangle"],
		["oval", "Oval", "svg:oval"], ["star", "Star", "svg:star"], ["heart", "Heart", "svg:heart"], ["diamond", "Diamond", "svg:diamond"],
		["pentagon", "Pentagon", "svg:pentagon"], ["hexagon", "Hexagon", "svg:hexagon"], ["crescent", "Crescent", "svg:crescent"], ["arrow", "Arrow", "svg:arrow"]
	]);
	var ABC = [["a", "apple", "🍎"], ["b", "ball", "⚽"], ["c", "cat", "🐱"], ["d", "dog", "🐶"], ["e", "egg", "🥚"], ["f", "fish", "🐟"], ["g", "grapes", "🍇"],
		["h", "hat", "🎩"], ["i", "ice cream", "🍦"], ["j", "juice", "🧃"], ["k", "kite", "🪁"], ["l", "lion", "🦁"], ["m", "moon", "🌙"], ["n", "nose", "👃"],
		["o", "orange", "🍊"], ["p", "pig", "🐷"], ["q", "queen", "👑"], ["r", "rainbow", "🌈"], ["s", "sun", "☀️"], ["t", "tree", "🌳"], ["u", "umbrella", "☂️"],
		["v", "violin", "🎻"], ["w", "watermelon", "🍉"], ["x", "xylophone", "svg:xylophone"], ["y", "yo-yo", "🪀"], ["z", "zebra", "🦓"]];
	add("letters", ABC.map(function (r) { return [r[0], r[0].toUpperCase(), r[2], { letter: r[0], ex: r[1] }]; }));
	var NUMW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
	var COUNT_PICS = ["⭐", "🍎", "🐞", "🎈", "🐟", "🌸", "🍓", "🚗", "🐥", "🍪"];
	var nums = []; for (var n = 1; n <= 20; n++) nums.push([String(n), String(n), "num:" + n, { n: n, nw: NUMW[n], cp: COUNT_PICS[(n - 1) % COUNT_PICS.length] }]);
	add("numbers", nums);
	add("food", [
		["apple", "Apple", "🍎"], ["banana", "Banana", "🍌"], ["strawberry", "Strawberry", "🍓"], ["grapes", "Grapes", "🍇"], ["orange", "Orange", "🍊"],
		["watermelon", "Watermelon", "🍉"], ["carrot", "Carrot", "🥕"], ["corn", "Corn", "🌽"], ["broccoli", "Broccoli", "🥦"], ["bread", "Bread", "🍞"],
		["cheese", "Cheese", "🧀"], ["egg", "Egg", "🥚"], ["milk", "Milk", "🥛"], ["cookie", "Cookie", "🍪"], ["cake", "Cake", "🍰"], ["pizza", "Pizza", "🍕"],
		["pear", "Pear", "🍐"], ["cherries", "Cherries", "🍒"]
	]);
	add("things", [
		["ball", "Ball", "⚽"], ["teddy", "Teddy bear", "🧸"], ["book", "Book", "📖"], ["cup", "Cup", "🥤"], ["shoe", "Shoe", "👟"], ["hat", "Cap", "🧢"],
		["sock", "Sock", "🧦"], ["spoon", "Spoon", "🥄"], ["bed", "Bed", "🛏️"], ["chair", "Chair", "🪑"], ["key", "Key", "🔑"], ["clock", "Clock", "⏰"],
		["balloon", "Balloon", "🎈"], ["present", "Present", "🎁"], ["umbrella", "Umbrella", "☂️"], ["house", "House", "🏠"], ["tree", "Tree", "🌳"],
		["flower", "Flower", "🌸"], ["sun", "Sun", "☀️"], ["moon", "Moon", "🌙"], ["rainbow", "Rainbow", "🌈"], ["star", "Star", "⭐"]
	]);
	add("vehicles", [
		["car", "Car", "🚗"], ["bus", "Bus", "🚌"], ["truck", "Truck", "🚚"], ["firetruck", "Fire truck", "🚒"], ["police", "Police car", "🚓"],
		["ambulance", "Ambulance", "🚑"], ["train", "Train", "🚂"], ["plane", "Airplane", "✈️"], ["boat", "Boat", "⛵"], ["bike", "Bicycle", "🚲"],
		["tractor", "Tractor", "🚜"], ["helicopter", "Helicopter", "🚁"], ["rocket", "Rocket", "🚀"], ["motorbike", "Motorbike", "🏍️"]
	]);
	add("body", [
		["eye", "Eye", "👁️"], ["ear", "Ear", "👂"], ["nose", "Nose", "👃"], ["mouth", "Mouth", "👄"], ["hand", "Hand", "✋"], ["foot", "Foot", "🦶"],
		["tooth", "Tooth", "🦷"], ["arm", "Arm", "💪"], ["leg", "Leg", "🦵"]
	]);

	var BY_ID = {}; ITEMS.forEach(function (it) { BY_ID[it.id] = it; });

	// Each page = a mode: which categories it can show (and which are on by default).
	var MODES = {
		cards: { cats: ["animals", "colours", "shapes", "letters", "numbers", "food", "things", "vehicles", "body"], def: ["animals", "colours", "shapes", "food", "things", "vehicles"] },
		animals: { cats: ["animals"], def: ["animals"], onlySound: true },
		abc: { cats: ["letters"], def: ["letters"], order: true },
		shapes: { cats: ["shapes", "colours"], def: ["shapes", "colours"] },
		numbers: { cats: ["numbers"], def: ["numbers"], order: true }
	};

	// ---------- Random ----------
	function rng(seed) {   // mulberry32; seed undefined = Math.random
		if (seed == null) return Math.random;
		var a = seed >>> 0;
		return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	}
	function shuffle(arr, r) { r = r || Math.random; var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
	// Shuffle but never start with `avoid` (so a reshuffle doesn't show the same card again)
	function reshuffle(arr, avoid, r) { var a = shuffle(arr, r); if (a.length > 1 && a[0] === avoid) { var t = a[0]; a[0] = a[1]; a[1] = t; } return a; }

	function hasSound(it) { return !!(it && (it.snd || it.sw)); }
	// The deck for a mode: ids of every item in the chosen categories (only those a mode allows); opts.maxNum caps numbers; opts.onlySound keeps animals with a sound
	function deck(mode, cats, opts) {
		opts = opts || {};
		var m = MODES[mode] || MODES.cards, allow = {}, out = [];
		(cats && cats.length ? cats : m.def).forEach(function (c) { if (m.cats.indexOf(c) >= 0) allow[c] = 1; });
		if (!Object.keys(allow).length) m.def.forEach(function (c) { allow[c] = 1; });
		var maxNum = opts.maxNum || 10;
		ITEMS.forEach(function (it) {
			if (!allow[it.cat]) return;
			if (it.cat === "numbers" && it.n > maxNum) return;
			if ((opts.onlySound || m.onlySound) && it.cat === "animals" && !hasSound(it)) return;
			out.push(it.id);
		});
		return out;
	}
	function step(i, d, len) { if (!len) return 0; return ((i + d) % len + len) % len; }

	// "What's this?" choices: the answer plus n-1 others, same category first, never two with the same word or picture; shuffled
	function quizChoices(id, pool, n, r) {
		n = n || 3; r = r || Math.random;
		var ans = BY_ID[id]; if (!ans) return [];
		var seenW = {}, seenP = {}; seenW[ans.word.toLowerCase()] = 1; seenP[ans.pic] = 1;
		function ok(x) { var it = BY_ID[x]; return it && x !== id && !seenW[it.word.toLowerCase()] && !seenP[it.pic]; }
		var same = shuffle(pool.filter(function (x) { return ok(x) && BY_ID[x].cat === ans.cat; }), r);
		var other = shuffle(pool.filter(function (x) { return ok(x) && BY_ID[x].cat !== ans.cat; }), r);
		if (same.length + other.length < n - 1) other = other.concat(shuffle(ITEMS.map(function (i) { return i.id; }).filter(function (x) { return ok(x) && pool.indexOf(x) < 0 && BY_ID[x].cat === ans.cat; }), r));
		var pick = [id], cand = same.concat(other);
		for (var i = 0; i < cand.length && pick.length < n; i++) { var it = BY_ID[cand[i]]; if (seenW[it.word.toLowerCase()] || seenP[it.pic]) continue; seenW[it.word.toLowerCase()] = 1; seenP[it.pic] = 1; pick.push(cand[i]); }
		return shuffle(pick, r);
	}

	// ---------- Words ----------
	function caseWord(word, mode) {   // mode: "upper" | "lower" | "title" | "both" (letters: "Aa")
		word = String(word);
		if (mode === "upper") return word.toUpperCase();
		if (mode === "lower") return word.toLowerCase();
		return word.charAt(0).toUpperCase() + word.slice(1);
	}
	function label(it, letterCase) {     // what the card shows in big letters
		if (it.cat === "letters") return letterCase === "upper" ? it.letter.toUpperCase() : letterCase === "lower" ? it.letter : it.letter.toUpperCase() + it.letter;
		if (it.cat === "numbers") return String(it.n);
		return caseWord(it.word, letterCase === "both" ? "title" : letterCase);
	}
	function subLabel(it) {             // the smaller line under the big word
		if (it.cat === "letters") return it.ex;
		if (it.cat === "numbers") return it.nw;
		return "";
	}
	// What is spoken when a card appears. opts.count: count numbers out loud; opts.soundWord: say the animal's sound after its name
	function speakText(it, opts) {
		opts = opts || {};
		if (it.cat === "letters") return it.letter.toUpperCase() + ". " + it.letter.toUpperCase() + " is for " + it.ex + ".";
		if (it.cat === "numbers") {
			var s = caseWord(it.nw) + ".";
			if (opts.count && it.n <= 20) { var c = []; for (var i = 1; i <= it.n; i++) c.push(NUMW[i]); s += " " + caseWord(c.join(", ")) + "!"; }
			return s;
		}
		if (it.cat === "animals" && opts.soundWord && it.sw) return it.word + ". The " + it.word.toLowerCase() + " says " + it.sw.toLowerCase() + "!";
		return it.word + ".";
	}
	function findPrompt(it) {           // quiz question
		if (it.cat === "letters") return "Find the letter " + it.letter.toUpperCase() + "!";
		if (it.cat === "numbers") return "Find " + it.nw + "!";
		if (it.cat === "colours") return "Find " + it.word.toLowerCase() + "!";
		if (it.cat === "animals" && it.snd) return "Who says " + it.sw.toLowerCase() + "? Find the " + it.word.toLowerCase() + "!";
		var w = it.word.toLowerCase();
		return "Find the " + w + "!";
	}
	var PRAISE = ["Yes! Well done!", "Great job!", "You found it!", "Super!", "Hooray!", "Amazing!", "That's right!", "Brilliant!"];
	function praise(it, r) { var p = PRAISE[Math.floor((r || Math.random)() * PRAISE.length)]; return p + " " + (it.cat === "letters" ? "That's " + it.letter.toUpperCase() + "." : it.cat === "numbers" ? "That's " + it.nw + "." : it.cat === "colours" ? "That's " + it.word.toLowerCase() + "." : "That's the " + it.word.toLowerCase() + "."); }
	function gentle(it) { return "That's " + (it.cat === "letters" ? "the letter " + it.letter.toUpperCase() : it.cat === "numbers" ? it.nw : it.cat === "colours" ? it.word.toLowerCase() : "the " + it.word.toLowerCase()) + ". Try again!"; }

	function soundFor(it) { return it && it.snd && SOUNDS[it.snd] ? "/kids/sounds/" + it.snd + ".mp3" : ""; }
	function keyToId(key, pool) {      // a typed letter / digit jumps to that card (ABC + numbers pages)
		if (!key || key.length !== 1) return "";
		var k = key.toLowerCase();
		if (/[a-z]/.test(k) && pool.indexOf("letters:" + k) >= 0) return "letters:" + k;
		if (/[0-9]/.test(k)) { var id = "numbers:" + (k === "0" ? "10" : k); if (pool.indexOf(id) >= 0) return id; }
		return "";
	}

	// ---------- Voices ----------
	function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
	function filterVoices(voices, q) {
		var t = norm(q).split(/\s+/).filter(Boolean);
		return voices.filter(function (v) { var h = norm(v.name + " " + v.lang + (v.localService ? " device" : " online")); return t.every(function (w) { return h.indexOf(w) >= 0; }); });
	}
	// Default voice: the most natural-sounding one the device offers, in the browser's language first, then English.
	// Neural / "Natural" voices (Edge: Microsoft Aria / Jenny / Ana Online (Natural)), Apple Premium / Enhanced voices, Google and Siri voices
	// come first, warm female voices before male ones, novelty voices last. avoid = { voiceKey: 1 } = voices that did not speak here.
	var WARM = /\b(ava|samantha|zoe|allison|susan|karen|moira|tessa|serena|kate|fiona|aria|jenny|ana|michelle|emma|libby|sonia|natasha|clara|joanna|salli|kimberly|ivy|kendra|nicky|zira|hazel|catherine|nora|evie|sara|female)\b/i;
	var MALE = /\b(male|daniel|alex|fred|tom|aaron|arthur|guy|davis|eric|ryan|thomas|oliver|george|rishi|lee|mark|david|james|roger|brian|christopher|andrew|william|liam|steffan|jacob|tony|ralph|junior|gordon)\b/i;
	var OLD = /\b(kathy|fred|junior|ralph|agnes|bruce|vicki|victoria|princess)\b/i;   // the 1990s Mac voices: clear but robotic
	var NOVELTY = /novelty|whisper|bahh|bad news|good news|bells|boing|bubbles|cellos|zarvox|trinoids|albert|hysterical|jester|organ|superstar|wobble|grandpa|grandma|rocko|shelley|\bflo\b|eddy|reed|sandy|deranged/i;
	function voiceScore(v, lang) {
		lang = (lang || "en-US").toLowerCase();
		var base = lang.split("-")[0], l = String(v.lang || "").toLowerCase().replace("_", "-"), n = String(v.name || ""), s = 0;
		if (l === lang) s += 100; else if (l.split("-")[0] === base) s += 80; else if (l.indexOf("en") === 0) s += 20; else return -1;
		if (/natural|neural/i.test(n)) s += 30;
		if (/premium/i.test(n)) s += 26; else if (/enhanced/i.test(n)) s += 20;
		if (/^google\b/i.test(n)) s += 14;
		if (/siri/i.test(n)) s += 14;
		if (/compact|espeak/i.test(n)) s -= 8;
		if (MALE.test(n)) s -= 6; else if (WARM.test(n) || /^google us english$/i.test(n)) s += 8;
		if (OLD.test(n)) s -= 24;
		if (NOVELTY.test(n)) s -= 60;
		if (v.localService) s += 1;
		return s;
	}
	function vKey(v) { return (v.voiceURI || v.name) + "|" + v.lang; }
	function pickVoice(voices, lang, avoid) {
		var best = null, bs = -1;
		(voices || []).forEach(function (v) { if (avoid && avoid[vKey(v)]) return; var s = voiceScore(v, lang); if (s > bs) { bs = s; best = v; } });
		return best;
	}

	// Voice styles for grown-ups: rate / pitch / volume and how the text is said. "teacher" = the default: warm, clear, a little sing-songy.
	var STYLES = {
		teacher: { name: "Teacher", icon: "🍎", rate: 0.82, pitch: 1.18 },
		calm: { name: "Calm", icon: "🌙", rate: 0.72, pitch: 1.02 },
		silly: { name: "Silly high", icon: "🐭", rate: 1.0, pitch: 1.95 },
		giant: { name: "Giant deep", icon: "🦕", rate: 0.66, pitch: 0.5 },
		robot: { name: "Robot", icon: "🤖", rate: 0.9, pitch: 0.62, robot: true },
		whisper: { name: "Whisper", icon: "🤫", rate: 0.7, pitch: 1.12, volume: 0.35 }
	};
	// The text as the style says it: Teacher says a one-word card with a cheerful "!" ("Cow!"); Robot says every word on its own ("Cow. The. Cow. Says. Moo.").
	function styleText(text, style) {
		var st = STYLES[style] || STYLES.teacher;
		text = String(text || "");
		if (st.robot) return text.replace(/[!?,]/g, ".").split(/\s+/).map(function (w) { return w.replace(/\.+$/, ""); }).filter(Boolean).join(". ") + ".";
		if (style === "teacher" || !STYLES[style]) return text.replace(/^([A-Z][a-z]{1,10}( [a-z]{2,10})?)\.$/, "$1!");
		return text;
	}

	// Voices that don't speak (Android lists voices whose data is not installed): the same rules as the Speed Reader's SRLib.speechFailure.
	var VOICE_ERRORS = { "synthesis-unavailable": 1, "synthesis-failed": 1, "voice-unavailable": 1, "language-unavailable": 1, "audio-hardware": 1 };
	function speechFailure(o) {
		o = o || {};
		if (o.error) {
			if (o.error === "interrupted" || o.error === "canceled" || o.error === "not-allowed") return "";
			return VOICE_ERRORS[o.error] || !o.started ? "error" : "";
		}
		if (!o.started) return "nostart";
		if (o.boundary) return "";
		if ((o.words || 0) >= 3 && o.ms < Math.max(300, 0.2 * (o.expectMs || 0))) return "silent";
		return "";
	}
	// remembered bad voices { key: { t, lang } }, forgotten after `days` (default 30: the voice data may get installed later)
	function pruneBadVoices(map, now, days) {
		var out = {}, max = (days || 30) * 864e5;
		if (!map || typeof map !== "object") return out;
		for (var k in map) if (map[k] && typeof map[k].t === "number" && now - map[k].t < max && now >= map[k].t - 6e4) out[k] = { t: map[k].t, lang: String(map[k].lang || "") };
		return out;
	}

	// ---------- Settings ----------
	var DEFAULTS = { rate: 0.82, pitch: 1.18, style: "teacher", voice: "", auto: true, sw: true, snd: true, showWord: true, lcase: "title", maxNum: 10, count: true, adv: 0, quizN: 3, theme: "bright" };
	function clean(s) {
		s = s && typeof s === "object" ? s : {};
		var o = {};
		for (var k in DEFAULTS) o[k] = DEFAULTS[k];
		function num(v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
		o.rate = num(s.rate, 0.4, 1.5, DEFAULTS.rate); o.pitch = num(s.pitch, 0.5, 2, DEFAULTS.pitch);
		o.voice = typeof s.voice === "string" ? s.voice.slice(0, 300) : "";
		if (STYLES[s.style]) o.style = s.style;
		["auto", "sw", "snd", "showWord", "count"].forEach(function (k) { if (typeof s[k] === "boolean") o[k] = s[k]; });
		if (["upper", "lower", "title", "both"].indexOf(s.lcase) >= 0) o.lcase = s.lcase;
		o.ord = {};
		if (s.ord && typeof s.ord === "object") for (var md in MODES) if (s.ord[md] === "order" || s.ord[md] === "shuffle") o.ord[md] = s.ord[md];
		o.maxNum = [5, 10, 20].indexOf(Number(s.maxNum)) >= 0 ? Number(s.maxNum) : 10;
		o.adv = [0, 4, 6, 10, 15].indexOf(Number(s.adv)) >= 0 ? Number(s.adv) : 0;
		o.quizN = [2, 3, 4].indexOf(Number(s.quizN)) >= 0 ? Number(s.quizN) : 3;
		if (["bright", "calm"].indexOf(s.theme) >= 0) o.theme = s.theme;
		o.cats = {};
		if (s.cats && typeof s.cats === "object") for (var m in MODES) if (Array.isArray(s.cats[m])) o.cats[m] = s.cats[m].filter(function (c) { return MODES[m].cats.indexOf(c) >= 0; });
		return o;
	}

	// Cards in order (ABC, numbers) or shuffled (the rest), unless the grown-up chose
	function orderFor(s, mode) { return (s.ord && s.ord[mode]) || ((MODES[mode] || {}).order ? "order" : "shuffle"); }

	var api = { orderFor: orderFor, CATS: CATS, ITEMS: ITEMS, BY_ID: BY_ID, SOUNDS: SOUNDS, MODES: MODES, NUMW: NUMW, DEFAULTS: DEFAULTS,
		rng: rng, shuffle: shuffle, reshuffle: reshuffle, deck: deck, step: step, quizChoices: quizChoices, hasSound: hasSound,
		caseWord: caseWord, label: label, subLabel: subLabel, speakText: speakText, findPrompt: findPrompt, praise: praise, gentle: gentle,
		soundFor: soundFor, keyToId: keyToId, filterVoices: filterVoices, pickVoice: pickVoice, voiceScore: voiceScore, vKey: vKey, STYLES: STYLES, styleText: styleText,
		speechFailure: speechFailure, pruneBadVoices: pruneBadVoices, clean: clean };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.MESKids = api;
})(this);

/* MES Kids page script (tool_apps_src/kids/app.js). One script for the hub (/kids) and the five activity pages; data-mode on #kd picks the page.
   Data + pure logic: lib.js (window.MESKids). Settings: localStorage "mes-kids:v1" (shared by all the pages), stars: "mes-kids:stars". */
(function () {
	"use strict";
	var K = window.MESKids, root = document.getElementById("kd");
	if (!K || !root) return;
	var mode = root.getAttribute("data-mode");
	function $(id) { return document.getElementById(id); }
	var toastT;
	function toast(msg) { var t = $("kd-toast"); if (!t) return; t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	if (mode === "hub") return;
	var MODE = K.MODES[mode] || K.MODES.cards;

	// ---------- settings ----------
	var KEY = "mes-kids:v1", S;
	try { S = K.clean(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { S = K.clean({}); }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var stars = 0; try { stars = Math.max(0, parseInt(localStorage.getItem("mes-kids:stars") || "0", 10) || 0); } catch (e) {}
	function saveStars() { try { localStorage.setItem("mes-kids:stars", String(stars)); } catch (e) {} }
	function cats() { var c = S.cats[mode]; return c && c.length ? c : MODE.def.slice(); }
	root.setAttribute("data-theme", S.theme);

	// ---------- pictures ----------
	var SHAPE_COL = { circle: "#e53935", square: "#1e88e5", triangle: "#fdd835", rectangle: "#43a047", oval: "#8e24aa", star: "#fbc02d", heart: "#e91e63", diamond: "#00acc1", pentagon: "#fb8c00", hexagon: "#5e35b1", crescent: "#ffca28", arrow: "#26a69a" };
	function poly(n, r, rot) { var p = []; for (var i = 0; i < n; i++) { var a = rot + i * 2 * Math.PI / n; p.push((50 + r * Math.cos(a)).toFixed(1) + "," + (50 + r * Math.sin(a)).toFixed(1)); } return p.join(" "); }
	function starPts() { var p = []; for (var i = 0; i < 10; i++) { var r = i % 2 ? 19 : 46, a = -Math.PI / 2 + i * Math.PI / 5; p.push((50 + r * Math.cos(a)).toFixed(1) + "," + (52 + r * Math.sin(a)).toFixed(1)); } return p.join(" "); }
	function shapeSvg(name) {
		var c = SHAPE_COL[name] || "#e53935", st = ' fill="' + c + '" stroke="rgba(0,0,0,.22)" stroke-width="2.5" stroke-linejoin="round"', b;
		switch (name) {
			case "circle": b = '<circle cx="50" cy="50" r="44"' + st + '/>'; break;
			case "square": b = '<rect x="9" y="9" width="82" height="82" rx="3"' + st + '/>'; break;
			case "triangle": b = '<polygon points="50,8 94,88 6,88"' + st + '/>'; break;
			case "rectangle": b = '<rect x="2" y="24" width="96" height="52" rx="3"' + st + '/>'; break;
			case "oval": b = '<ellipse cx="50" cy="50" rx="47" ry="31"' + st + '/>'; break;
			case "star": b = '<polygon points="' + starPts() + '"' + st + '/>'; break;
			case "heart": b = '<path d="M50 88 C20 66 4 50 4 31 C4 16 16 6 29 6 C39 6 46 12 50 20 C54 12 61 6 71 6 C84 6 96 16 96 31 C96 50 80 66 50 88 Z"' + st + '/>'; break;
			case "diamond": b = '<polygon points="50,4 88,50 50,96 12,50"' + st + '/>'; break;
			case "pentagon": b = '<polygon points="' + poly(5, 46, -Math.PI / 2) + '"' + st + '/>'; break;
			case "hexagon": b = '<polygon points="' + poly(6, 46, 0) + '"' + st + '/>'; break;
			case "crescent": b = '<path d="M64 6 A44 44 0 1 0 64 94 A34 34 0 1 1 64 6 Z"' + st + '/>'; break;
			case "arrow": b = '<polygon points="4,38 56,38 56,16 96,50 56,84 56,62 4,62"' + st + '/>'; break;
			case "xylophone":
				b = '<rect x="6" y="66" width="88" height="8" rx="3" fill="#8d6e63"/><rect x="6" y="28" width="88" height="8" rx="3" fill="#8d6e63"/>';
				["#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa"].forEach(function (col, i) { var h = 70 - i * 7; b += '<rect x="' + (10 + i * 14) + '" y="' + (50 - h / 2) + '" width="11" height="' + h + '" rx="3" fill="' + col + '" stroke="rgba(0,0,0,.2)"/>'; });
				b += '<line x1="70" y1="92" x2="92" y2="70" stroke="#6d4c41" stroke-width="4" stroke-linecap="round"/><circle cx="92" cy="68" r="6" fill="#e53935"/>';
				break;
			default: b = "";
		}
		return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + b + "</svg>";
	}
	function blobSvg(hex) {
		var ring = hex.toLowerCase() === "#ffffff" ? ' stroke="#9aa0b4" stroke-width="2"' : hex === "#111111" ? ' stroke="#777" stroke-width="2"' : ' stroke="rgba(0,0,0,.15)" stroke-width="2"';
		var d = "M50 6 C64 4 72 14 82 18 C94 24 96 38 92 50 C98 62 92 76 80 82 C70 92 58 96 46 92 C32 96 18 90 12 78 C4 66 6 52 10 42 C6 28 16 14 28 12 C36 6 42 8 50 6 Z";
		return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="' + d + '" fill="' + hex + '"' + ring + '/><ellipse cx="34" cy="30" rx="10" ry="6" fill="rgba(255,255,255,.35)"/></svg>';
	}
	function countHtml(it) {
		var s = ""; for (var i = 0; i < it.n; i++) s += "<span>" + it.cp + "</span>";
		return '<span class="kd-count' + (it.n <= 5 ? " kd-count--big" : "") + '" style="grid-template-columns:repeat(' + Math.min(5, it.n) + ',1fr)">' + s + "</span>";
	}
	function picHtml(it) {
		var p = it.pic;
		if (p.indexOf("svg:") === 0) return shapeSvg(p.slice(4));
		if (p.indexOf("col:") === 0) return blobSvg(p.slice(4));
		if (p.indexOf("num:") === 0) return countHtml(it);
		return esc(p);
	}
	function choiceHtml(it) {
		if (it.cat === "letters") return '<span style="font-family:var(--kd-font);font-weight:900">' + esc(K.label(it, S.lcase === "both" ? "upper" : S.lcase === "lower" ? "lower" : "upper")) + "</span>";
		if (it.cat === "numbers") return it.n <= 5 ? countHtml(it) : '<span style="font-family:var(--kd-font);font-weight:900">' + it.n + "</span>";
		return picHtml(it);
	}

	// ---------- speech + sounds ----------
	var synth = window.speechSynthesis || null, voices = [], token = 0, audio = null, unlocked = false;
	function loadVoices() { if (!synth) return; try { voices = synth.getVoices() || []; } catch (e) { voices = []; } fillVoices(); }
	var vKey = K.vKey;
	// Voices that didn't speak on this device (Android lists voices whose data isn't installed): remembered for 30 days in "mes-kids:badvoices"
	var BADKEY = "mes-kids:badvoices", bad = {}, strikes = {}, anySpoke = false;
	try { bad = K.pruneBadVoices(JSON.parse(localStorage.getItem(BADKEY) || "{}"), Date.now()); } catch (e) { bad = {}; }
	function saveBad() { try { localStorage.setItem(BADKEY, JSON.stringify(bad)); } catch (e) {} }
	function autoVoice() { return K.pickVoice(voices, navigator.language || "en-US", bad); }
	function voice() {
		var v = null, i;
		if (S.voice && !bad[S.voice]) for (i = 0; i < voices.length; i++) if (vKey(voices[i]) === S.voice) { v = voices[i]; break; }
		return v || autoVoice();
	}
	function markBad(v, why) {
		if (!v) return;
		var k = vKey(v); if (bad[k]) return;
		bad[k] = { t: Date.now(), lang: v.lang || "" }; saveBad(); vsig = "";
		var next = autoVoice();
		hint("The voice " + v.name + " didn't speak on this device" + (next ? ", so we switched to " + next.name : "") + ".");
		fillVoices();
	}
	function style() { return K.STYLES[S.style] || K.STYLES.teacher; }
	function stopAll() { token++; try { if (synth) synth.cancel(); } catch (e) {} if (audio) { try { audio.pause(); } catch (e) {} audio = null; } }
	// say(text) -> promise that resolves when speech ends (or right away without speech). A voice that doesn't speak is marked bad and the text is said again with the next one.
	function say(text, tk, retry) {
		return new Promise(function (res) {
			if (!synth || !text) return res();
			var spoken = K.styleText(text, S.style), st = style();
			var u = new SpeechSynthesisUtterance(spoken), v = voice(), done = false, started = false, boundary = false, t0 = 0, err = "";
			if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
			u.rate = S.rate; u.pitch = S.pitch; u.volume = st.volume || 1;
			var words = spoken.split(/\s+/).filter(Boolean).length, expect = words * 420 / S.rate;
			function fin() {
				if (done) return; done = true; clearTimeout(nt);
				var why = tk === token && unlocked && !document.hidden ? K.speechFailure({ error: err, started: started, boundary: boundary, words: words, ms: t0 ? Date.now() - t0 : 0, expectMs: expect }) : "";
				// a voice error marks the voice at once; "never started" / "too quick" only once some voice has really spoken on this page
				// (else the device may simply have no sound output) and only on the second time for the same voice
				var k = v ? vKey(v) : "";
				if (why && why !== "error") { if (!anySpoke) why = ""; else { strikes[k] = (strikes[k] || 0) + 1; if (strikes[k] < 2) why = ""; } }
				if (!why && started) strikes[k] = 0;
				if (why && v && !retry) { markBad(v, why); if (voice() && voice() !== v) return say(text, tk, true).then(res); }
				res();
			}
			u.onstart = function () { started = true; anySpoke = true; t0 = Date.now(); };
			u.onboundary = function () { boundary = true; };
			u.onend = fin; u.onerror = function (e) { err = (e && e.error) || "error"; fin(); };
			// never wait forever (some voices never fire onend); a voice that never starts counts as not working
			var nt = setTimeout(fin, Math.max(3500, 1500 + spoken.length * 160 / S.rate));
			try { synth.speak(u); } catch (e) { fin(); }
		});
	}
	function play(src) {
		return new Promise(function (res) {
			if (!src) return res();
			var a = new Audio(src); audio = a;
			var done = false; function fin() { if (done) return; done = true; res(); }
			a.onended = fin; a.onerror = fin;
			var p = a.play(); if (p && p.catch) p.catch(fin);
			setTimeout(fin, 8000);
		});
	}
	// The full "say this card" sequence; a newer call cancels an older one
	function sayCard(it, opts) {
		opts = opts || {};
		stopAll(); var tk = token;
		var isAnimal = it.cat === "animals", rec = isAnimal && S.snd ? K.soundFor(it) : "";
		var text = K.speakText(it, { count: S.count, soundWord: false });
		var p = opts.soundOnly ? Promise.resolve() : say(text, tk);
		if (isAnimal) {
			p = p.then(function () {
				if (tk !== token) return;
				if (rec) return play(rec);
				if (it.sw && (S.sw || opts.soundOnly)) return say(it.sw + "!", tk);
			}).then(function () {
				if (tk !== token || opts.soundOnly || !rec || !S.sw || !it.sw) return;
				return say("The " + it.word.toLowerCase() + " says " + it.sw.toLowerCase() + "!", tk);
			});
		}
		return p;
	}

	// ---------- deck ----------
	var pool = [], order = [], idx = 0, play_ = "learn", lastDir = 0;
	function rebuild(keepId) {
		pool = K.deck(mode, cats(), { maxNum: S.maxNum });
		order = K.orderFor(S, mode) === "order" ? pool.slice() : K.shuffle(pool);
		idx = keepId && order.indexOf(keepId) >= 0 ? order.indexOf(keepId) : 0;
	}
	function cur() { return K.BY_ID[order[idx]]; }

	var cardEl = $("kd-card"), picEl = $("kd-pic"), wordEl = $("kd-word"), subEl = $("kd-sub"), stage = $("kd-stage"), posEl = $("kd-pos");
	var bgN = 0;
	function paintBg() { bgN = (bgN + 1) % 8; stage.style.setProperty("--kd-cbg", "var(--kd-c" + bgN + ")"); }
	function render(speak) {
		var it = cur(); if (!it) return;
		paintBg();
		stage.classList.toggle("kd-qmode", play_ === "quiz");
		if (play_ === "quiz") return renderQuiz(speak);
		$("kd-qz").hidden = true; cardEl.hidden = false;
		picEl.innerHTML = picHtml(it);
		picEl.setAttribute("aria-label", "Say it again: " + it.word);
		wordEl.textContent = K.label(it, S.lcase);
		wordEl.classList.toggle("kd-hide", !S.showWord);
		subEl.textContent = S.showWord ? K.subLabel(it) : "";
		$("kd-snd").hidden = !(it.cat === "animals" && (it.snd || it.sw));
		posEl.textContent = (idx + 1) + " / " + order.length;
		cardEl.classList.remove("kd-in", "kd-l", "kd-r"); void cardEl.offsetWidth;
		cardEl.classList.add(lastDir < 0 ? "kd-l" : lastDir > 0 ? "kd-r" : "kd-in");
		if (speak && S.auto && unlocked) sayCard(it);
		armAdv();
	}
	function go(d) { if (!order.length) return; lastDir = d; idx = K.step(idx, d, order.length); if (d > 0 && idx === 0 && K.orderFor(S, mode) === "shuffle") { order = K.reshuffle(pool, order[order.length - 1]); } render(true); }
	function shuffleNow() { order = K.reshuffle(pool, order[idx]); idx = 0; lastDir = 0; render(true); toast("Shuffled!"); }

	// slideshow
	var advT;
	function armAdv() { clearTimeout(advT); if (S.adv && play_ === "learn" && $("kd-set").hidden) advT = setTimeout(function () { go(1); }, S.adv * 1000); }

	// ---------- quiz ----------
	var quiz = null;
	function renderQuiz(speak) {
		var it = cur();
		cardEl.hidden = true; $("kd-qz").hidden = false; $("kd-snd").hidden = true;
		var ids = K.quizChoices(it.id, pool, S.quizN);
		quiz = { ans: it.id, solved: false };
		var box = $("kd-choices"); box.innerHTML = ""; box.style.setProperty("--kd-n", ids.length); box.setAttribute("data-n", ids.length);
		ids.forEach(function (id) {
			var c = K.BY_ID[id], b = document.createElement("button");
			b.type = "button"; b.className = "kd-choice"; b.setAttribute("data-id", id); b.setAttribute("aria-label", c.cat === "letters" ? "Letter " + c.letter.toUpperCase() : c.word);
			b.innerHTML = choiceHtml(c);
			b.addEventListener("click", function () { pick(b, c); });
			box.appendChild(b);
		});
		$("kd-qq").textContent = "🔊 " + K.findPrompt(it);
		posEl.textContent = "";
		if (speak && unlocked) askAgain();
	}
	function askAgain() { var it = cur(); stopAll(); var tk = token; say(K.findPrompt(it), tk).then(function () { if (tk === token && it.cat === "animals" && it.snd && S.snd) play(K.soundFor(it)); }); }
	function pick(btn, it) {
		if (!quiz || quiz.solved) return;
		unlocked = true;
		if (it.id === quiz.ans) {
			quiz.solved = true; btn.classList.add("kd-yes");
			stars++; saveStars(); $("kd-stars").textContent = stars; burst();
			stopAll(); var tk = token;
			say(K.praise(it), tk).then(function () { return new Promise(function (r) { setTimeout(r, 500); }); }).then(function () { if (tk === token && play_ === "quiz") go(1); });
		} else {
			btn.classList.remove("kd-no"); void btn.offsetWidth; btn.classList.add("kd-no");
			stopAll(); say(K.gentle(it), token);
		}
	}
	function burst() {
		var b = $("kd-burst"), s = ["⭐", "🌟", "✨", "🎉", "💛", "🎈"];
		b.innerHTML = "";
		for (var i = 0; i < 14; i++) {
			var e = document.createElement("span"), a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 180;
			e.textContent = s[i % s.length]; e.style.setProperty("--x", Math.round(Math.cos(a) * r) + "px"); e.style.setProperty("--y", Math.round(Math.sin(a) * r) + "px"); e.style.setProperty("--r", Math.round(Math.random() * 360 - 180) + "deg");
			b.appendChild(e);
		}
		setTimeout(function () { b.innerHTML = ""; }, 1300);
	}
	function setPlay(p, user) {
		play_ = p; stopAll(); clearTimeout(advT);
		$("kd-m-learn").setAttribute("aria-selected", p === "learn"); $("kd-m-quiz").setAttribute("aria-selected", p === "quiz");
		$("kd-score").hidden = p !== "quiz"; $("kd-stars").textContent = stars;
		$("kd-say").innerHTML = p === "quiz" ? '<span aria-hidden="true">🔊</span> Ask again' : '<span aria-hidden="true">🔊</span> Say it again';
		$("kd-shuf").hidden = p === "quiz";
		if (user) unlock(); render(true);
	}

	// ---------- start: browsers only speak after the first tap ----------
	var startBtn = document.createElement("button");
	startBtn.type = "button"; startBtn.className = "kd-big kd-big--go kd-start"; startBtn.innerHTML = '<span aria-hidden="true">▶</span> Tap to start';
	startBtn.style.cssText = "position:absolute;left:50%;bottom:2.2em;transform:translateX(-50%);z-index:4;font-size:1.4em;box-shadow:var(--kd-shadow)";
	stage.appendChild(startBtn);
	function unlock() { if (unlocked) return; unlocked = true; startBtn.remove(); }
	startBtn.addEventListener("click", function (e) { e.stopPropagation(); unlock(); if (play_ === "quiz") askAgain(); else sayCard(cur()); stage.focus({ preventScroll: true }); });

	// ---------- buttons, swipe, keys ----------
	var swiped = false;
	picEl.addEventListener("click", function () { if (swiped) return; unlock(); picEl.classList.remove("kd-wig"); void picEl.offsetWidth; picEl.classList.add("kd-wig"); sayCard(cur()); armAdv(); });
	wordEl.addEventListener("click", function () { unlock(); sayCard(cur()); });
	$("kd-prev").addEventListener("click", function () { unlock(); go(-1); });
	$("kd-next").addEventListener("click", function () { unlock(); go(1); });
	$("kd-back").addEventListener("click", function () { unlock(); go(-1); });
	$("kd-fwd").addEventListener("click", function () { unlock(); go(1); });
	$("kd-shuf").addEventListener("click", function () { unlock(); shuffleNow(); });
	$("kd-say").addEventListener("click", function () { unlock(); if (play_ === "quiz") askAgain(); else sayCard(cur()); armAdv(); });
	$("kd-qq").addEventListener("click", function () { unlock(); askAgain(); });
	$("kd-snd").addEventListener("click", function () { unlock(); sayCard(cur(), { soundOnly: true }); armAdv(); });
	$("kd-m-learn").addEventListener("click", function () { setPlay("learn", true); });
	$("kd-m-quiz").addEventListener("click", function () { setPlay("quiz", true); });
	var sx = 0, sy = 0, sid = null;
	stage.addEventListener("pointerdown", function (e) { sid = e.pointerId; sx = e.clientX; sy = e.clientY; swiped = false; });
	stage.addEventListener("pointerup", function (e) {
		if (e.pointerId !== sid) return; sid = null;
		var dx = e.clientX - sx, dy = e.clientY - sy;
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { swiped = true; unlock(); go(dx < 0 ? 1 : -1); setTimeout(function () { swiped = false; }, 50); }
	});
	stage.addEventListener("pointercancel", function () { sid = null; });
	stage.addEventListener("contextmenu", function (e) { if (kiosk) e.preventDefault(); });

	document.addEventListener("keydown", function (e) {
		if (!$("kd-set").hidden) { if (e.key === "Escape") { e.preventDefault(); closeSet(); } return; }
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
		var inStage = kiosk || $("kd-wrap").contains(t);
		if (!inStage) return;
		if (e.ctrlKey || e.metaKey || e.altKey) { if (kiosk) hint("Grown-ups: hold ✕ for 2 seconds to leave."); return; }
		var k = e.key;
		if (k === "Escape") { if (kiosk) { e.preventDefault(); hint("Grown-ups: hold ✕ for 2 seconds to leave."); } return; }
		if (k === "Tab") { if (kiosk) { /* keep focus inside the kiosk */ var f = Array.prototype.slice.call($("kd-wrap").querySelectorAll("button:not([hidden])")).filter(function (b) { return b.offsetParent; }); if (f.length && !$("kd-wrap").contains(document.activeElement)) { e.preventDefault(); f[0].focus(); } } return; }
		if (e.target && tag === "BUTTON" && (k === "Enter" || k === " ") && !t.classList.contains("kd-stage")) return;   // a focused button handles its own key
		unlock();
		if (play_ === "quiz" && /^[1-4]$/.test(k)) { var bs = $("kd-choices").children; if (bs[+k - 1]) bs[+k - 1].click(); e.preventDefault(); return; }
		if (k === "ArrowRight" || k === "PageDown" || k === "Enter") { e.preventDefault(); go(1); return; }
		if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") { e.preventDefault(); go(-1); return; }
		if (k === " " || k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); if (play_ === "quiz") askAgain(); else sayCard(cur()); return; }
		if (k.length === 1) {   // a typed letter / digit jumps to that card; any other key just shows the next card (keyboard bashing is part of the fun)
			e.preventDefault();
			var id = play_ === "learn" ? K.keyToId(k, order) : "";
			if (id) { idx = order.indexOf(id); lastDir = 0; render(true); } else if (play_ === "learn") go(1);
		}
	});

	var hintT;
	function hint(msg) { var h = $("kd-hint"); h.textContent = msg; toast(msg); clearTimeout(hintT); hintT = setTimeout(function () { h.textContent = ""; }, 4000); }

	// ---------- hold-to-press (parent gate) ----------
	function holdBtn(btn, cb) {
		var t = null, fired = false;
		function start(e) { if (t) return; fired = false; btn.classList.add("kd-holding"); t = setTimeout(function () { t = null; fired = true; btn.classList.remove("kd-holding"); if (navigator.vibrate) try { navigator.vibrate(30); } catch (x) {} cb(); }, 2000); if (e && e.cancelable && e.type === "pointerdown") e.preventDefault(); }
		function stop() { if (t) { clearTimeout(t); t = null; btn.classList.remove("kd-holding"); if (!fired) hint("Grown-ups: keep holding for 2 seconds."); } }
		btn.addEventListener("pointerdown", start);
		["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { btn.addEventListener(ev, stop); });
		btn.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } });
		btn.addEventListener("keyup", function (e) { if (e.key === "Enter" || e.key === " ") stop(); });
		btn.addEventListener("click", function (e) { e.preventDefault(); });
		btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	}

	// ---------- kiosk: Fill window / Full screen ----------
	var kiosk = false, pushed = false, wrap = $("kd-wrap");
	function onBefore(e) { e.preventDefault(); e.returnValue = ""; return ""; }
	function onPop() { if (kiosk) { history.pushState({ kd: 1 }, ""); hint("Grown-ups: hold ✕ for 2 seconds to leave."); } }
	function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
	function enterKiosk(fs) {
		closeSet(true);
		if (!kiosk) {
			kiosk = true; wrap.classList.add("kd-on"); document.documentElement.classList.add("kd-lock");
			$("kd-exit").hidden = false;
			window.addEventListener("beforeunload", onBefore);
			try { history.pushState({ kd: 1 }, ""); pushed = true; } catch (e) {}
			window.addEventListener("popstate", onPop);
		}
		if (fs) {
			var r = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
			if (r) { try { var p = r.call(wrap); if (p && p.catch) p.catch(function () { hint("Full screen isn't allowed here; the page fills the window instead."); }); } catch (e) {} }
			else hint("This browser has no full screen for pages; the page fills the window instead.");
		}
		unlock(); stage.focus({ preventScroll: true }); render(false);
	}
	function exitKiosk() {
		if (!kiosk) return;
		kiosk = false; wrap.classList.remove("kd-on"); document.documentElement.classList.remove("kd-lock");
		$("kd-exit").hidden = true;
		window.removeEventListener("beforeunload", onBefore); window.removeEventListener("popstate", onPop);
		if (fsEl()) { var x = document.exitFullscreen || document.webkitExitFullscreen; if (x) try { x.call(document); } catch (e) {} }
		if (pushed) { pushed = false; try { history.back(); } catch (e) {} }
		render(false);
	}
	function onFsChange() { if (kiosk && !fsEl()) hint("Full screen closed; the cards still fill the window. Hold ✕ for 2 seconds to leave."); }
	document.addEventListener("fullscreenchange", onFsChange); document.addEventListener("webkitfullscreenchange", onFsChange);
	$("kd-fill").addEventListener("click", function () { enterKiosk(false); });
	$("kd-fs").addEventListener("click", function () { enterKiosk(true); });
	holdBtn($("kd-exit"), exitKiosk);

	// ---------- settings ----------
	var setEl = $("kd-set");
	holdBtn($("kd-gear"), openSet);
	function seg(id, val, cb) {
		var box = $(id);
		Array.prototype.forEach.call(box.children, function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-v") === String(val))); });
		if (!box.__w) { box.__w = 1; box.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; cb(b.getAttribute("data-v")); syncSet(); }); }
	}
	function chk(id, key, after) { var c = $(id); c.checked = !!S[key]; if (!c.__w) { c.__w = 1; c.addEventListener("change", function () { S[key] = c.checked; save(); if (after) after(); }); } }
	function syncSet() {
		var allowed = MODE.cats, on = cats();
		$("kd-sec-cats").hidden = allowed.length < 2;
		var box = $("kd-cats"); box.innerHTML = "";
		allowed.forEach(function (cid) {
			var c = K.CATS.filter(function (x) { return x.id === cid; })[0];
			var n = K.deck(mode, [cid], { maxNum: S.maxNum }).length;
			var b = document.createElement("button"); b.type = "button"; b.className = "kd-cat"; b.setAttribute("aria-pressed", String(on.indexOf(cid) >= 0));
			b.innerHTML = '<span aria-hidden="true">' + c.icon + "</span>" + esc(c.name) + " <small>" + n + "</small>";
			b.addEventListener("click", function () {
				var list = cats().slice(), i = list.indexOf(cid);
				if (i >= 0) { if (list.length === 1) { toast("Keep at least one."); return; } list.splice(i, 1); } else list.push(cid);
				S.cats[mode] = list; save(); rebuild(order[idx]); syncSet(); render(false);
			});
			box.appendChild(b);
		});
		$("kd-count").textContent = pool.length + " cards";
		var hasLetters = on.indexOf("letters") >= 0, hasNum = on.indexOf("numbers") >= 0, hasAnimals = on.indexOf("animals") >= 0;
		$("kd-row-num").hidden = !hasNum; $("kd-row-count").hidden = !hasNum; $("kd-sec-snd").hidden = !hasAnimals;
		$("kd-row-case").hidden = mode === "numbers";
		chk("kd-o-word", "showWord", function () { render(false); });
		chk("kd-o-count", "count"); chk("kd-o-snd", "snd"); chk("kd-o-sw", "sw"); chk("kd-o-auto", "auto");
		seg("kd-o-case", S.lcase, function (v) { S.lcase = v; save(); render(false); });
		seg("kd-o-order", K.orderFor(S, mode), function (v) { S.ord[mode] = v; save(); rebuild(order[idx]); render(false); });
		seg("kd-o-num", S.maxNum, function (v) { S.maxNum = +v; save(); rebuild(order[idx]); render(false); });
		seg("kd-o-adv", S.adv, function (v) { S.adv = +v; save(); });
		seg("kd-o-qn", S.quizN, function (v) { S.quizN = +v; save(); if (play_ === "quiz") render(false); });
		seg("kd-o-theme", S.theme, function (v) { S.theme = v; save(); root.setAttribute("data-theme", v); });
		seg("kd-o-style", S.style, function (v) { var st = K.STYLES[v]; if (!st) return; S.style = v; S.rate = st.rate; S.pitch = st.pitch; save(); stopAll(); unlock(); say("Hello! Look, a cow. Moo!", token); });
		$("kd-rate").value = S.rate; $("kd-rate-v").textContent = S.rate.toFixed(2) + "×";
		$("kd-pitch").value = S.pitch; $("kd-pitch-v").textContent = S.pitch.toFixed(2);
		fillVoices();
	}
	// ABC page: the case buttons read Aa / A / a / Aa; other pages Cat / CAT / cat / Cat
	function caseLabels() {
		var b = $("kd-o-case").children;
		if (mode === "abc") { b[0].textContent = "Aa"; b[1].textContent = "A"; b[2].textContent = "a"; b[3].hidden = true; }
	}
	var lastFocus = null;
	function openSet() {
		lastFocus = document.activeElement; stopAll(); clearTimeout(advT);
		syncSet(); setEl.hidden = false; $("kd-set-x").focus();
	}
	function closeSet(quiet) { if (setEl.hidden) return; setEl.hidden = true; if (!quiet) { render(false); if (lastFocus && lastFocus.focus) lastFocus.focus(); } armAdv(); }
	$("kd-set-x").addEventListener("click", function () { closeSet(); });
	$("kd-set-done").addEventListener("click", function () { closeSet(); });
	setEl.addEventListener("click", function (e) { if (e.target === setEl) closeSet(); });
	$("kd-rate").addEventListener("input", function () { S.rate = +this.value; $("kd-rate-v").textContent = S.rate.toFixed(2) + "×"; save(); });
	$("kd-pitch").addEventListener("input", function () { S.pitch = +this.value; $("kd-pitch-v").textContent = S.pitch.toFixed(2); save(); });
	$("kd-rate").addEventListener("change", function () { stopAll(); say("Hello! Let's play.", token); });
	$("kd-pitch").addEventListener("change", function () { stopAll(); say("Hello! Let's play.", token); });
	$("kd-test").addEventListener("click", function () { unlock(); sayCard(cur()); });
	$("kd-vreset").addEventListener("click", function () { var st = style(); S.rate = st.rate; S.pitch = st.pitch; save(); syncSet(); });
	// voice style buttons, from K.STYLES
	(function () { var box = $("kd-o-style"); if (!box) return; Object.keys(K.STYLES).forEach(function (k) { var st = K.STYLES[k], b = document.createElement("button"); b.type = "button"; b.setAttribute("data-v", k); b.setAttribute("role", "radio"); b.innerHTML = '<span aria-hidden="true">' + st.icon + "</span> " + esc(st.name); box.appendChild(b); }); })();
	$("kd-s-fill").addEventListener("click", function () { enterKiosk(false); });
	$("kd-s-fs").addEventListener("click", function () { enterKiosk(true); });
	$("kd-s-stars").addEventListener("click", function () { stars = 0; saveStars(); $("kd-stars").textContent = "0"; toast("Stars reset."); });

	// voice list: English and the browser's language first; the shared searchable picker (main_js/voice-picker.js) makes it searchable
	var vsel = $("kd-voice"), vsig = "";
	function fillVoices() {
		if (!vsel) return;
		if (!synth) { $("kd-vnote").textContent = "This browser can't speak, so the cards are silent. Animal recordings still play."; vsel.disabled = true; return; }
		var sig = voices.map(vKey).join(",") + "#" + S.voice + "#" + Object.keys(bad).join(",");
		if (sig === vsig) return; vsig = sig;
		var bl = (navigator.language || "en").toLowerCase().split("-")[0];
		var groups = { top: [], en: [], other: [] };
		voices.forEach(function (v) { var b = (v.lang || "").toLowerCase().split(/[-_]/)[0]; (b === bl && bl !== "en" ? groups.top : b === "en" ? groups.en : groups.other).push(v); });
		var auto = autoVoice();
		vsel.innerHTML = "";
		var o = document.createElement("option"); o.value = ""; o.textContent = "Automatic" + (auto ? " (" + auto.name + ")" : ""); vsel.appendChild(o);
		[["top", "Your language"], ["en", "English"], ["other", "Other languages"]].forEach(function (g) {
			if (!groups[g[0]].length) return;
			var og = document.createElement("optgroup"); og.label = g[1];
			groups[g[0]].sort(function (a, b) { return a.lang === b.lang ? a.name.localeCompare(b.name) : a.lang.localeCompare(b.lang); }).forEach(function (v) {
				var op = document.createElement("option"); op.value = vKey(v); op.textContent = (bad[vKey(v)] ? "⚠ " : "") + v.name + " (" + v.lang + ")" + (v.localService ? "" : " · online") + (bad[vKey(v)] ? " · didn't speak here" : ""); og.appendChild(op);
			});
			vsel.appendChild(og);
		});
		vsel.value = S.voice; if (vsel.value !== S.voice) vsel.value = "";
		$("kd-vnote").textContent = voices.length ? voices.length + " voices on this device. Automatic picks the most natural one it finds (voices named Natural, Premium, Enhanced or Google sound best; on an iPhone, iPad or Mac you can download more under Settings > Accessibility > Spoken Content > Voices). The voice is your device's own: nothing is sent anywhere." : "Loading voices…";
	}
	if (vsel) vsel.addEventListener("change", function () { S.voice = vsel.value; if (bad[S.voice]) { delete bad[S.voice]; saveBad(); } save(); vsig = ""; stopAll(); unlock(); say("Hello! This is " + (cur() ? cur().word.toLowerCase() : "a cat") + ".", token); });
	if (window.MESVoicePicker && vsel) window.MESVoicePicker.enhance(vsel, { sample: "Hello! Look, a cow. Moo!" });
	if (synth) { loadVoices(); try { synth.addEventListener("voiceschanged", loadVoices); } catch (e) { synth.onvoiceschanged = loadVoices; } setTimeout(loadVoices, 600); }

	// ---------- credits ----------
	var cl = $("kd-credlist");
	if (cl) {
		var byS = {}; K.ITEMS.forEach(function (it) { if (it.snd) byS[it.snd] = it; });
		Object.keys(K.SOUNDS).forEach(function (k) {
			var s = K.SOUNDS[k], it = byS[k], li = document.createElement("li");
			li.innerHTML = "<b>" + esc(it ? it.word : k) + "</b>" + (s[4] ? " (" + esc(s[4]) + ")" : "") + ': <a href="' + esc(s[1]) + '" rel="noopener" target="_blank">' + esc(s[0]) + "</a>, by " + esc(s[2]) + ". Licence: " + esc(s[3]) + ".";
			cl.appendChild(li);
		});
		if (mode !== "animals" && !(MODE.cats.indexOf("animals") >= 0)) $("kd-credits").hidden = true;
	}

	// ---------- go ----------
	caseLabels();
	rebuild();
	render(false);
	var q = /[?&]play=quiz\b/.test(location.search);
	if (q) setPlay("quiz");
	if (!synth) hint("This browser can't speak. Pictures and animal recordings still work.");
})();
