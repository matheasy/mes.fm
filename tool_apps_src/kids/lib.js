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
