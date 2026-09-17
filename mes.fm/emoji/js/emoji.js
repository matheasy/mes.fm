/* MES Emoji Copier -- mes.fm/emoji
 *
 * Click a tile, it's copied. Click the small corner button to expand it into
 * a large transparent-background PNG (drawn on a <canvas> using the device's
 * own emoji font -- nothing uploaded, nothing installed).
 * Each entry: c = emoji character(s), n = display name (also searched),
 * k = extra search keywords (optional).
 */
(function () {
	"use strict";

	var $ = function (id) { return document.getElementById(id); };
	var RECENT_KEY = "mes-emoji-recent-v1";
	var MAX_RECENT = 14;
	var COLLAPSE_KEY = "mes-emoji-collapsed-v1";

	var EXPAND_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		'<polyline points="9 3 3 3 3 9"></polyline><polyline points="15 3 21 3 21 9"></polyline>' +
		'<polyline points="9 21 3 21 3 15"></polyline><polyline points="15 21 21 21 21 15"></polyline></svg>';

	var CATEGORIES = [
		{
			name: "Smileys & Happy",
			items: [
				{ c: "😀", n: "grinning face" },
				{ c: "😃", n: "grinning face with big eyes" },
				{ c: "😄", n: "grinning face with smiling eyes" },
				{ c: "😁", n: "beaming face with smiling eyes" },
				{ c: "😆", n: "grinning squinting face" },
				{ c: "😅", n: "grinning face with sweat" },
				{ c: "🤣", n: "rolling on the floor laughing", k: "lol lmao" },
				{ c: "😂", n: "face with tears of joy", k: "laughing crying laughter" },
				{ c: "🙂", n: "slightly smiling face" },
				{ c: "🙃", n: "upside-down face" },
				{ c: "😉", n: "winking face", k: "wink" },
				{ c: "😊", n: "smiling face with smiling eyes" },
				{ c: "😇", n: "smiling face with halo", k: "angel innocent" },
				{ c: "🥰", n: "smiling face with hearts" },
				{ c: "😍", n: "heart eyes", k: "love struck" },
				{ c: "🤩", n: "star-struck" },
				{ c: "😘", n: "face blowing a kiss", k: "kiss" },
				{ c: "😗", n: "kissing face" },
				{ c: "😚", n: "kissing face with closed eyes" },
				{ c: "😙", n: "kissing face with smiling eyes" },
				{ c: "😋", n: "face savoring food", k: "yum" },
				{ c: "😛", n: "face with tongue" },
				{ c: "😜", n: "winking face with tongue" },
				{ c: "🤪", n: "zany face", k: "goofy crazy" },
				{ c: "😝", n: "squinting face with tongue" },
				{ c: "🤑", n: "money-mouth face" },
				{ c: "🤗", n: "hugging face", k: "hug" },
				{ c: "🤭", n: "face with hand over mouth" },
				{ c: "🤫", n: "shushing face", k: "quiet" },
				{ c: "🤔", n: "thinking face", k: "hmm" },
				{ c: "🤨", n: "face with raised eyebrow", k: "skeptical" },
				{ c: "😐", n: "neutral face" },
				{ c: "😑", n: "expressionless face" },
				{ c: "😶", n: "face without mouth" },
				{ c: "😏", n: "smirking face", k: "smirk" },
				{ c: "😒", n: "unamused face" },
				{ c: "🙄", n: "face with rolling eyes", k: "eye roll" },
				{ c: "😬", n: "grimacing face" },
				{ c: "🤥", n: "lying face", k: "pinocchio" }
			]
		},
		{
			name: "Sad, Crying & Angry",
			items: [
				{ c: "😌", n: "relieved face" },
				{ c: "😔", n: "pensive face" },
				{ c: "😪", n: "sleepy face" },
				{ c: "😴", n: "sleeping face", k: "zzz" },
				{ c: "🥱", n: "yawning face" },
				{ c: "😕", n: "confused face" },
				{ c: "😟", n: "worried face" },
				{ c: "🙁", n: "slightly frowning face" },
				{ c: "☹️", n: "frowning face" },
				{ c: "😮", n: "face with open mouth" },
				{ c: "😯", n: "hushed face" },
				{ c: "😲", n: "astonished face", k: "shocked" },
				{ c: "😳", n: "flushed face", k: "embarrassed" },
				{ c: "🥺", n: "pleading face", k: "puppy eyes" },
				{ c: "😦", n: "frowning face with open mouth" },
				{ c: "😧", n: "anguished face" },
				{ c: "😨", n: "fearful face" },
				{ c: "😰", n: "anxious face with sweat" },
				{ c: "😥", n: "sad but relieved face" },
				{ c: "😢", n: "crying face", k: "tear sad" },
				{ c: "😭", n: "loudly crying face", k: "sobbing bawling" },
				{ c: "😱", n: "face screaming in fear" },
				{ c: "😖", n: "confounded face" },
				{ c: "😣", n: "persevering face" },
				{ c: "😞", n: "disappointed face" },
				{ c: "😓", n: "downcast face with sweat" },
				{ c: "😩", n: "weary face" },
				{ c: "😫", n: "tired face" },
				{ c: "🥹", n: "face holding back tears" },
				{ c: "😤", n: "face with steam from nose", k: "frustrated" },
				{ c: "😡", n: "pouting face", k: "angry mad" },
				{ c: "😠", n: "angry face", k: "mad" },
				{ c: "🤬", n: "face with symbols on mouth", k: "cursing swearing" },
				{ c: "🥵", n: "hot face" },
				{ c: "🥶", n: "cold face" },
				{ c: "🥴", n: "woozy face" },
				{ c: "😵", n: "dizzy face" },
				{ c: "🤯", n: "exploding head", k: "mind blown" },
				{ c: "🤢", n: "nauseated face" },
				{ c: "🤮", n: "vomiting face" },
				{ c: "🤧", n: "sneezing face" },
				{ c: "😷", n: "face with medical mask" },
				{ c: "🤒", n: "face with thermometer", k: "sick" },
				{ c: "🤕", n: "face with head-bandage", k: "injured" }
			]
		},
		{
			name: "Love & Hearts",
			items: [
				{ c: "❤️", n: "red heart" },
				{ c: "🧡", n: "orange heart" },
				{ c: "💛", n: "yellow heart" },
				{ c: "💚", n: "green heart" },
				{ c: "💙", n: "blue heart" },
				{ c: "💜", n: "purple heart" },
				{ c: "🖤", n: "black heart" },
				{ c: "🤍", n: "white heart" },
				{ c: "🤎", n: "brown heart" },
				{ c: "💔", n: "broken heart" },
				{ c: "❣️", n: "heart exclamation" },
				{ c: "💕", n: "two hearts" },
				{ c: "💞", n: "revolving hearts" },
				{ c: "💓", n: "beating heart" },
				{ c: "💗", n: "growing heart" },
				{ c: "💖", n: "sparkling heart" },
				{ c: "💘", n: "heart with arrow", k: "cupid" },
				{ c: "💝", n: "heart with ribbon" },
				{ c: "💟", n: "heart decoration" },
				{ c: "😻", n: "heart eyes cat" },
				{ c: "💋", n: "kiss mark" }
			]
		},
		{
			name: "Gestures & Hands",
			items: [
				{ c: "👋", n: "waving hand", k: "hello bye" },
				{ c: "🤚", n: "raised back of hand" },
				{ c: "🖐️", n: "hand with fingers splayed" },
				{ c: "✋", n: "raised hand", k: "stop high five" },
				{ c: "🖖", n: "vulcan salute", k: "spock" },
				{ c: "👌", n: "OK hand" },
				{ c: "🤌", n: "pinched fingers" },
				{ c: "🤏", n: "pinching hand" },
				{ c: "✌️", n: "victory hand", k: "peace" },
				{ c: "🤞", n: "crossed fingers", k: "good luck" },
				{ c: "🤟", n: "love-you gesture" },
				{ c: "🤘", n: "sign of the horns", k: "rock on" },
				{ c: "🤙", n: "call me hand" },
				{ c: "👈", n: "backhand index pointing left" },
				{ c: "👉", n: "backhand index pointing right" },
				{ c: "👆", n: "backhand index pointing up" },
				{ c: "👇", n: "backhand index pointing down" },
				{ c: "☝️", n: "index pointing up" },
				{ c: "👍", n: "thumbs up", k: "like approve" },
				{ c: "👎", n: "thumbs down", k: "dislike" },
				{ c: "✊", n: "raised fist" },
				{ c: "👊", n: "oncoming fist", k: "fist bump" },
				{ c: "🤛", n: "left-facing fist" },
				{ c: "🤜", n: "right-facing fist" },
				{ c: "👏", n: "clapping hands", k: "applause" },
				{ c: "🙌", n: "raising hands", k: "celebration" },
				{ c: "👐", n: "open hands" },
				{ c: "🤲", n: "palms up together" },
				{ c: "🙏", n: "folded hands", k: "please thanks pray" },
				{ c: "✍️", n: "writing hand" },
				{ c: "💅", n: "nail polish" },
				{ c: "🤳", n: "selfie" },
				{ c: "💪", n: "flexed biceps", k: "muscle strong" }
			]
		},
		{
			name: "Fun, Monsters & Fantasy",
			items: [
				{ c: "💩", n: "pile of poo", k: "poop" },
				{ c: "👻", n: "ghost" },
				{ c: "💀", n: "skull" },
				{ c: "☠️", n: "skull and crossbones" },
				{ c: "👽", n: "alien" },
				{ c: "👾", n: "alien monster", k: "space invader" },
				{ c: "🤖", n: "robot" },
				{ c: "🎃", n: "jack-o-lantern", k: "pumpkin halloween" },
				{ c: "😺", n: "grinning cat" },
				{ c: "😸", n: "grinning cat with smiling eyes" },
				{ c: "😹", n: "cat with tears of joy" },
				{ c: "😼", n: "cat with wry smile" },
				{ c: "😽", n: "kissing cat" },
				{ c: "🙀", n: "weary cat" },
				{ c: "😿", n: "crying cat" },
				{ c: "😾", n: "pouting cat" },
				{ c: "🧟", n: "zombie" },
				{ c: "🧛", n: "vampire" },
				{ c: "🧙", n: "mage", k: "wizard witch" },
				{ c: "🧜", n: "merperson", k: "mermaid" },
				{ c: "🧚", n: "fairy" },
				{ c: "🎅", n: "santa claus" },
				{ c: "🤶", n: "mrs claus" },
				{ c: "🦸", n: "superhero" },
				{ c: "🦹", n: "supervillain" }
			]
		},
		{
			name: "Animals",
			items: [
				{ c: "🐶", n: "dog face" },
				{ c: "🐱", n: "cat face" },
				{ c: "🐭", n: "mouse face" },
				{ c: "🐹", n: "hamster" },
				{ c: "🐰", n: "rabbit face" },
				{ c: "🦊", n: "fox" },
				{ c: "🐻", n: "bear" },
				{ c: "🐼", n: "panda" },
				{ c: "🐻‍❄️", n: "polar bear" },
				{ c: "🐨", n: "koala" },
				{ c: "🐯", n: "tiger face" },
				{ c: "🦁", n: "lion" },
				{ c: "🐮", n: "cow face" },
				{ c: "🐷", n: "pig face" },
				{ c: "🐸", n: "frog" },
				{ c: "🐵", n: "monkey face" },
				{ c: "🙈", n: "see-no-evil monkey" },
				{ c: "🙉", n: "hear-no-evil monkey" },
				{ c: "🙊", n: "speak-no-evil monkey" },
				{ c: "🐔", n: "chicken" },
				{ c: "🐧", n: "penguin" },
				{ c: "🐦", n: "bird" },
				{ c: "🐤", n: "baby chick" },
				{ c: "🦆", n: "duck" },
				{ c: "🦅", n: "eagle" },
				{ c: "🦉", n: "owl" },
				{ c: "🦇", n: "bat" },
				{ c: "🐺", n: "wolf" },
				{ c: "🐗", n: "boar" },
				{ c: "🐴", n: "horse face" },
				{ c: "🦄", n: "unicorn" },
				{ c: "🐝", n: "honeybee", k: "bee" },
				{ c: "🐛", n: "bug" },
				{ c: "🦋", n: "butterfly" },
				{ c: "🐌", n: "snail" },
				{ c: "🐞", n: "lady beetle", k: "ladybug" },
				{ c: "🐜", n: "ant" },
				{ c: "🕷️", n: "spider" },
				{ c: "🦂", n: "scorpion" },
				{ c: "🐢", n: "turtle" },
				{ c: "🐍", n: "snake" },
				{ c: "🦎", n: "lizard" },
				{ c: "🦖", n: "T-Rex", k: "dinosaur" },
				{ c: "🦕", n: "sauropod", k: "dinosaur" },
				{ c: "🐙", n: "octopus" },
				{ c: "🦑", n: "squid" },
				{ c: "🦀", n: "crab" },
				{ c: "🐠", n: "tropical fish" },
				{ c: "🐟", n: "fish" },
				{ c: "🐬", n: "dolphin" },
				{ c: "🐳", n: "spouting whale" },
				{ c: "🐋", n: "whale" },
				{ c: "🦈", n: "shark" },
				{ c: "🐊", n: "crocodile" },
				{ c: "🦓", n: "zebra" },
				{ c: "🦍", n: "gorilla" },
				{ c: "🐘", n: "elephant" },
				{ c: "🦛", n: "hippopotamus" },
				{ c: "🦏", n: "rhinoceros" },
				{ c: "🐪", n: "camel" },
				{ c: "🦒", n: "giraffe" },
				{ c: "🦘", n: "kangaroo" },
				{ c: "🐄", n: "cow" },
				{ c: "🐖", n: "pig" },
				{ c: "🐑", n: "ewe", k: "sheep" },
				{ c: "🦙", n: "llama" },
				{ c: "🐐", n: "goat" },
				{ c: "🦌", n: "deer" },
				{ c: "🐕", n: "dog" },
				{ c: "🐩", n: "poodle" },
				{ c: "🐈", n: "cat" },
				{ c: "🦃", n: "turkey" },
				{ c: "🦚", n: "peacock" },
				{ c: "🦜", n: "parrot" },
				{ c: "🦢", n: "swan" },
				{ c: "🦩", n: "flamingo" },
				{ c: "🕊️", n: "dove" },
				{ c: "🦝", n: "raccoon" },
				{ c: "🦨", n: "skunk" },
				{ c: "🦡", n: "badger" },
				{ c: "🦦", n: "otter" },
				{ c: "🦥", n: "sloth" },
				{ c: "🐿️", n: "chipmunk" },
				{ c: "🦔", n: "hedgehog" }
			]
		},
		{
			name: "Weather",
			items: [
				{ c: "☀️", n: "sun", k: "sunny" },
				{ c: "🌤️", n: "sun behind small cloud" },
				{ c: "⛅", n: "sun behind cloud", k: "partly cloudy" },
				{ c: "🌥️", n: "sun behind large cloud" },
				{ c: "🌦️", n: "sun behind rain cloud" },
				{ c: "🌈", n: "rainbow" },
				{ c: "☁️", n: "cloud", k: "cloudy" },
				{ c: "🌧️", n: "cloud with rain", k: "rain" },
				{ c: "⛈️", n: "thunderstorm", k: "lightning storm" },
				{ c: "🌩️", n: "cloud with lightning" },
				{ c: "🌨️", n: "cloud with snow" },
				{ c: "❄️", n: "snowflake", k: "snow" },
				{ c: "☃️", n: "snowman" },
				{ c: "⛄", n: "snowman without snow" },
				{ c: "🌬️", n: "wind face", k: "windy" },
				{ c: "💨", n: "dashing away", k: "wind gust" },
				{ c: "🌪️", n: "tornado" },
				{ c: "🌫️", n: "fog", k: "foggy" },
				{ c: "🌊", n: "water wave" },
				{ c: "☂️", n: "umbrella" },
				{ c: "☔", n: "umbrella with rain drops" },
				{ c: "⚡", n: "high voltage", k: "lightning bolt" },
				{ c: "🔥", n: "fire" },
				{ c: "💧", n: "droplet", k: "water drop" },
				{ c: "🧊", n: "ice cube", k: "ice" },
				{ c: "🌡️", n: "thermometer", k: "temperature" }
			]
		},
		{
			name: "Sun, Moon & Space",
			items: [
				{ c: "🌙", n: "crescent moon", k: "moon" },
				{ c: "🌛", n: "first quarter moon face" },
				{ c: "🌜", n: "last quarter moon face" },
				{ c: "🌚", n: "new moon face" },
				{ c: "🌝", n: "full moon face" },
				{ c: "🌞", n: "sun with face" },
				{ c: "🌕", n: "full moon" },
				{ c: "🌖", n: "waning gibbous moon" },
				{ c: "🌗", n: "last quarter moon" },
				{ c: "🌘", n: "waning crescent moon" },
				{ c: "🌑", n: "new moon" },
				{ c: "🌒", n: "waxing crescent moon" },
				{ c: "🌓", n: "first quarter moon" },
				{ c: "🌔", n: "waxing gibbous moon" },
				{ c: "🌎", n: "earth globe americas", k: "planet earth" },
				{ c: "🌍", n: "earth globe europe-africa", k: "planet earth" },
				{ c: "🌏", n: "earth globe asia-australia", k: "planet earth" },
				{ c: "🪐", n: "ringed planet", k: "saturn" },
				{ c: "⭐", n: "star" },
				{ c: "🌟", n: "glowing star" },
				{ c: "✨", n: "sparkles" },
				{ c: "💫", n: "dizzy star" },
				{ c: "🌠", n: "shooting star" },
				{ c: "☄️", n: "comet" },
				{ c: "🚀", n: "rocket" },
				{ c: "🛸", n: "flying saucer", k: "ufo" },
				{ c: "🛰️", n: "satellite" },
				{ c: "👨‍🚀", n: "astronaut" },
				{ c: "🌌", n: "milky way", k: "galaxy" }
			]
		},
		{
			name: "Food & Drink",
			items: [
				{ c: "🍏", n: "green apple" },
				{ c: "🍎", n: "red apple" },
				{ c: "🍌", n: "banana" },
				{ c: "🍉", n: "watermelon" },
				{ c: "🍇", n: "grapes" },
				{ c: "🍓", n: "strawberry" },
				{ c: "🫐", n: "blueberries" },
				{ c: "🍒", n: "cherries" },
				{ c: "🍑", n: "peach" },
				{ c: "🥭", n: "mango" },
				{ c: "🍍", n: "pineapple" },
				{ c: "🥥", n: "coconut" },
				{ c: "🥝", n: "kiwi fruit" },
				{ c: "🍅", n: "tomato" },
				{ c: "🥑", n: "avocado" },
				{ c: "🥦", n: "broccoli" },
				{ c: "🥕", n: "carrot" },
				{ c: "🌽", n: "ear of corn", k: "corn" },
				{ c: "🌶️", n: "hot pepper", k: "chili" },
				{ c: "🧀", n: "cheese wedge", k: "cheese" },
				{ c: "🥚", n: "egg" },
				{ c: "🍳", n: "cooking", k: "fried egg" },
				{ c: "🥞", n: "pancakes" },
				{ c: "🥓", n: "bacon" },
				{ c: "🍞", n: "bread" },
				{ c: "🥐", n: "croissant" },
				{ c: "🥨", n: "pretzel" },
				{ c: "🍔", n: "hamburger", k: "burger" },
				{ c: "🍟", n: "french fries", k: "fries" },
				{ c: "🍕", n: "pizza" },
				{ c: "🌭", n: "hot dog" },
				{ c: "🥪", n: "sandwich" },
				{ c: "🌮", n: "taco" },
				{ c: "🌯", n: "burrito" },
				{ c: "🥗", n: "green salad", k: "salad" },
				{ c: "🍿", n: "popcorn" },
				{ c: "🍩", n: "doughnut", k: "donut" },
				{ c: "🍪", n: "cookie" },
				{ c: "🎂", n: "birthday cake" },
				{ c: "🍰", n: "shortcake", k: "cake slice" },
				{ c: "🧁", n: "cupcake" },
				{ c: "🍫", n: "chocolate bar" },
				{ c: "🍬", n: "candy" },
				{ c: "🍭", n: "lollipop" },
				{ c: "🍯", n: "honey pot" },
				{ c: "☕", n: "hot beverage", k: "coffee" },
				{ c: "🍵", n: "teacup", k: "tea" },
				{ c: "🥤", n: "cup with straw", k: "soda" },
				{ c: "🍺", n: "beer mug", k: "beer" },
				{ c: "🍻", n: "clinking beer mugs", k: "cheers" },
				{ c: "🍷", n: "wine glass", k: "wine" },
				{ c: "🥂", n: "clinking glasses", k: "toast cheers" },
				{ c: "🍸", n: "cocktail glass" },
				{ c: "🍹", n: "tropical drink" }
			]
		},
		{
			name: "Activities & Sports",
			items: [
				{ c: "⚽", n: "soccer ball", k: "football" },
				{ c: "🏀", n: "basketball" },
				{ c: "🏈", n: "american football" },
				{ c: "⚾", n: "baseball" },
				{ c: "🥎", n: "softball" },
				{ c: "🎾", n: "tennis" },
				{ c: "🏐", n: "volleyball" },
				{ c: "🏉", n: "rugby football" },
				{ c: "🎱", n: "pool 8 ball", k: "billiards" },
				{ c: "🏓", n: "ping pong", k: "table tennis" },
				{ c: "🏸", n: "badminton" },
				{ c: "🥊", n: "boxing glove", k: "boxing" },
				{ c: "🥋", n: "martial arts uniform", k: "karate judo" },
				{ c: "⛳", n: "flag in hole", k: "golf" },
				{ c: "🏹", n: "bow and arrow", k: "archery" },
				{ c: "🎣", n: "fishing pole", k: "fishing" },
				{ c: "🥏", n: "flying disc", k: "frisbee" },
				{ c: "🛹", n: "skateboard" },
				{ c: "🎿", n: "skis", k: "skiing" },
				{ c: "🏂", n: "snowboarder", k: "snowboarding" },
				{ c: "🏄", n: "person surfing", k: "surfing" },
				{ c: "🚴", n: "person biking", k: "cycling" },
				{ c: "🏊", n: "person swimming", k: "swimming" },
				{ c: "🧗", n: "person climbing", k: "climbing" },
				{ c: "🏆", n: "trophy", k: "winner" },
				{ c: "🥇", n: "1st place medal", k: "gold medal" },
				{ c: "🥈", n: "2nd place medal", k: "silver medal" },
				{ c: "🥉", n: "3rd place medal", k: "bronze medal" },
				{ c: "🎮", n: "video game", k: "gaming controller" },
				{ c: "🎲", n: "game die", k: "dice" },
				{ c: "🧩", n: "puzzle piece" },
				{ c: "🎯", n: "direct hit", k: "dartboard bullseye" },
				{ c: "🎳", n: "bowling" },
				{ c: "🎪", n: "circus tent" }
			]
		},
		{
			name: "Travel & Places",
			items: [
				{ c: "🚗", n: "car" },
				{ c: "🚕", n: "taxi" },
				{ c: "🚙", n: "sport utility vehicle", k: "suv" },
				{ c: "🚌", n: "bus" },
				{ c: "🏎️", n: "racing car" },
				{ c: "🚓", n: "police car" },
				{ c: "🚑", n: "ambulance" },
				{ c: "🚒", n: "fire engine", k: "fire truck" },
				{ c: "🚚", n: "delivery truck" },
				{ c: "🚜", n: "tractor" },
				{ c: "🏍️", n: "motorcycle" },
				{ c: "🛵", n: "motor scooter" },
				{ c: "🚲", n: "bicycle", k: "bike" },
				{ c: "🛴", n: "kick scooter" },
				{ c: "🚂", n: "locomotive", k: "train" },
				{ c: "🚆", n: "train" },
				{ c: "🚇", n: "metro", k: "subway" },
				{ c: "✈️", n: "airplane", k: "plane" },
				{ c: "🛫", n: "airplane departure" },
				{ c: "🛬", n: "airplane arrival" },
				{ c: "🚁", n: "helicopter" },
				{ c: "⛵", n: "sailboat" },
				{ c: "🚤", n: "speedboat" },
				{ c: "🛳️", n: "passenger ship", k: "cruise" },
				{ c: "🚢", n: "ship" },
				{ c: "⚓", n: "anchor" },
				{ c: "🗽", n: "Statue of Liberty" },
				{ c: "🗼", n: "Tokyo tower" },
				{ c: "🏰", n: "castle" },
				{ c: "🎡", n: "ferris wheel" },
				{ c: "🎢", n: "roller coaster" },
				{ c: "🏖️", n: "beach with umbrella", k: "beach" },
				{ c: "🏝️", n: "desert island", k: "island" },
				{ c: "🏔️", n: "snow-capped mountain", k: "mountain" },
				{ c: "🌋", n: "volcano" },
				{ c: "🗻", n: "Mount Fuji" },
				{ c: "🏕️", n: "camping" },
				{ c: "🏠", n: "house" },
				{ c: "🏢", n: "office building" },
				{ c: "⛪", n: "church" },
				{ c: "🕌", n: "mosque" },
				{ c: "🕍", n: "synagogue" },
				{ c: "⛩️", n: "shinto shrine" }
			]
		},
		{
			name: "Objects",
			items: [
				{ c: "📱", n: "mobile phone", k: "phone" },
				{ c: "💻", n: "laptop", k: "computer" },
				{ c: "⌨️", n: "keyboard" },
				{ c: "🖥️", n: "desktop computer" },
				{ c: "🖨️", n: "printer" },
				{ c: "📷", n: "camera" },
				{ c: "📸", n: "camera with flash" },
				{ c: "🎥", n: "movie camera" },
				{ c: "📺", n: "television", k: "tv" },
				{ c: "📻", n: "radio" },
				{ c: "🎧", n: "headphone" },
				{ c: "🎤", n: "microphone" },
				{ c: "🔋", n: "battery" },
				{ c: "🔌", n: "electric plug" },
				{ c: "💡", n: "light bulb", k: "idea" },
				{ c: "🔦", n: "flashlight" },
				{ c: "🕯️", n: "candle" },
				{ c: "📕", n: "closed book", k: "book" },
				{ c: "📚", n: "books" },
				{ c: "✏️", n: "pencil" },
				{ c: "🖊️", n: "pen" },
				{ c: "📝", n: "memo", k: "note" },
				{ c: "📌", n: "pushpin" },
				{ c: "📎", n: "paperclip" },
				{ c: "✂️", n: "scissors" },
				{ c: "🔒", n: "locked", k: "lock" },
				{ c: "🔓", n: "unlocked" },
				{ c: "🔑", n: "key" },
				{ c: "🔨", n: "hammer" },
				{ c: "🛠️", n: "hammer and wrench", k: "tools" },
				{ c: "⚙️", n: "gear", k: "settings" },
				{ c: "🧲", n: "magnet" },
				{ c: "💣", n: "bomb" },
				{ c: "🔮", n: "crystal ball" },
				{ c: "🎁", n: "wrapped gift", k: "present" },
				{ c: "🎀", n: "ribbon" },
				{ c: "🛒", n: "shopping cart" },
				{ c: "💰", n: "money bag", k: "money" },
				{ c: "💳", n: "credit card" },
				{ c: "💎", n: "gem stone", k: "diamond" }
			]
		},
		{
			name: "Symbols & Signs",
			items: [
				{ c: "✅", n: "check mark button", k: "checkmark done" },
				{ c: "❌", n: "cross mark", k: "x mark wrong" },
				{ c: "❎", n: "cross mark button" },
				{ c: "✔️", n: "check mark" },
				{ c: "➕", n: "plus" },
				{ c: "➖", n: "minus" },
				{ c: "➗", n: "divide" },
				{ c: "✖️", n: "multiply" },
				{ c: "♻️", n: "recycling symbol", k: "recycle" },
				{ c: "⚠️", n: "warning" },
				{ c: "🚫", n: "prohibited", k: "no ban" },
				{ c: "🔇", n: "muted speaker", k: "mute" },
				{ c: "🔔", n: "bell", k: "notification" },
				{ c: "🔕", n: "bell with slash", k: "mute notification" },
				{ c: "💯", n: "hundred points", k: "100" },
				{ c: "🔴", n: "red circle" },
				{ c: "🟠", n: "orange circle" },
				{ c: "🟡", n: "yellow circle" },
				{ c: "🟢", n: "green circle" },
				{ c: "🔵", n: "blue circle" },
				{ c: "🟣", n: "purple circle" },
				{ c: "⚫", n: "black circle" },
				{ c: "⚪", n: "white circle" },
				{ c: "🟥", n: "red square" },
				{ c: "🟧", n: "orange square" },
				{ c: "🟨", n: "yellow square" },
				{ c: "🟩", n: "green square" },
				{ c: "🟦", n: "blue square" },
				{ c: "🟪", n: "purple square" },
				{ c: "⬛", n: "black large square" },
				{ c: "⬜", n: "white large square" }
			]
		},
		{
			name: "Flags",
			items: [
				{ c: "🏳️", n: "white flag" },
				{ c: "🏴", n: "black flag" },
				{ c: "🏁", n: "checkered flag", k: "race finish" },
				{ c: "🚩", n: "triangular flag" },
				{ c: "🏳️‍🌈", n: "rainbow flag", k: "pride" },
				{ c: "🏴‍☠️", n: "pirate flag" }
			]
		}
	];

	var searchEl = $("emo-search"), catsEl = $("emo-categories");
	var noResultsEl = $("emo-no-results"), noResultsQueryEl = $("emo-no-results-query");
	var recentBox = $("emo-recent"), recentList = $("emo-recent-list");
	var builderInput = $("emo-builder-input"), toastEl = $("emo-toast");
	var builderChars = []; // raw emoji clicked, in click order

	function esc(s) {
		return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}

	function tileHtml(item) {
		return '<div class="emo__tile-wrap">' +
			'<button type="button" class="emo__tile" data-emoji="' + esc(item.c) + '" data-name="' + esc(item.n) + '" title="' + esc(item.n) + '">' +
			'<span class="emo__tile-glyph">' + item.c + '</span>' +
			'<span class="emo__tile-name">' + esc(item.n) + '</span></button>' +
			'<button type="button" class="emo__tile-expand" data-expand="' + esc(item.c) + '" data-expand-name="' + esc(item.n) + '" title="Expand to large PNG" aria-label="Expand ' + esc(item.n) + ' to large PNG">' + EXPAND_ICON + '</button>' +
			'</div>';
	}

	// per-category collapsed state, keyed by category NAME so it survives the
	// CATEGORIES list being reordered/edited later; remembered per device
	var collapsedCats = (function () {
		try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]")); }
		catch (e) { return new Set(); }
	})();
	function saveCollapsed() {
		try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(collapsedCats))); } catch (e) {}
	}

	function renderCategories() {
		catsEl.innerHTML = CATEGORIES.map(function (cat, i) {
			var collapsed = collapsedCats.has(cat.name);
			return '<section class="emo__category' + (collapsed ? " emo__category--collapsed" : "") + '" id="emo-cat-' + i + '">' +
				'<h2 role="button" tabindex="0" aria-expanded="' + !collapsed + '" data-cat="' + esc(cat.name) + '">' +
				esc(cat.name) + ' <span class="arrow-icon">' + (collapsed ? "▸" : "▾") + '</span></h2>' +
				'<div class="emo__grid">' + cat.items.map(tileHtml).join("") + '</div></section>';
		}).join("");
	}

	function setCategoryCollapsed(section, collapsed) {
		var h2 = section.querySelector("h2");
		var name = h2.getAttribute("data-cat");
		section.classList.toggle("emo__category--collapsed", collapsed);
		h2.setAttribute("aria-expanded", String(!collapsed));
		h2.querySelector(".arrow-icon").textContent = collapsed ? "▸" : "▾";
		if (collapsed) collapsedCats.add(name); else collapsedCats.delete(name);
		saveCollapsed();
	}

	function toggleCategoryFromEvent(e) {
		var h2 = e.target.closest ? e.target.closest("h2") : null;
		if (!h2 || !catsEl.contains(h2)) return;
		var section = h2.closest(".emo__category");
		setCategoryCollapsed(section, !section.classList.contains("emo__category--collapsed"));
	}
	catsEl.addEventListener("click", toggleCategoryFromEvent);
	catsEl.addEventListener("keydown", function (e) {
		if (e.key !== "Enter" && e.key !== " ") return;
		if (!e.target.closest || !e.target.closest("h2")) return;
		e.preventDefault();
		toggleCategoryFromEvent(e);
	});

	$("emo-collapse-all").addEventListener("click", function () {
		var sections = document.querySelectorAll(".emo__category");
		var anyExpanded = Array.prototype.some.call(sections, function (s) {
			return !s.classList.contains("emo__category--collapsed");
		});
		Array.prototype.forEach.call(sections, function (s) { setCategoryCollapsed(s, anyExpanded); });
		this.textContent = anyExpanded ? "Expand all sections" : "Collapse all sections";
	});

	function findItem(ch) {
		for (var i = 0; i < CATEGORIES.length; i++) {
			for (var j = 0; j < CATEGORIES[i].items.length; j++) {
				if (CATEGORIES[i].items[j].c === ch) return CATEGORIES[i].items[j];
			}
		}
		return null;
	}

	/* ---- search ------------------------------------------------------ */

	function norm(s) { return s.toLowerCase().trim(); }

	function applySearch() {
		var q = norm(searchEl.value);
		var anyVisible = false;
		CATEGORIES.forEach(function (cat, i) {
			var section = $("emo-cat-" + i);
			var grid = section.querySelector(".emo__grid");
			var wraps = grid.children;
			var catHasMatch = false;
			for (var j = 0; j < cat.items.length; j++) {
				var item = cat.items[j];
				var hay = norm(item.n + " " + (item.k || ""));
				var match = !q || hay.indexOf(q) !== -1;
				wraps[j].hidden = !match;
				if (match) catHasMatch = true;
			}
			section.classList.toggle("emo__category--hide", !catHasMatch);
			section.classList.toggle("emo__category--force-open", !!q);
			if (catHasMatch) anyVisible = true;
		});
		noResultsEl.classList.toggle("hide", anyVisible || !q);
		noResultsQueryEl.textContent = searchEl.value;
	}

	/* ---- recently copied ---------------------------------------------- */

	function loadRecent() {
		try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (e) { return []; }
	}
	function saveRecent(list) {
		try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
	}
	function pushRecent(ch) {
		var list = loadRecent().filter(function (c) { return c !== ch; });
		list.unshift(ch);
		list = list.slice(0, MAX_RECENT);
		saveRecent(list);
		renderRecent(list);
	}
	function renderRecent(list) {
		list = list || loadRecent();
		if (!list.length) { recentBox.classList.add("hide"); return; }
		recentBox.classList.remove("hide");
		recentList.innerHTML = list.map(function (ch) {
			var item = findItem(ch);
			return item ? tileHtml(item) : "";
		}).join("");
	}

	/* ---- toast + copy -------------------------------------------------- */

	var toastTimer;
	function toast(msg) {
		toastEl.textContent = msg;
		toastEl.classList.add("emo__toast--show");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { toastEl.classList.remove("emo__toast--show"); }, 1400);
	}

	function execCommandCopy(text) {
		var ta = document.createElement("textarea");
		ta.value = text;
		ta.style.position = "fixed";
		ta.style.opacity = "0";
		document.body.appendChild(ta);
		ta.select();
		var ok = false;
		try { ok = document.execCommand("copy"); } catch (e) {}
		document.body.removeChild(ta);
		return ok;
	}
	function copyToClipboard(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text).catch(function () {
				return execCommandCopy(text) ? Promise.resolve() : Promise.reject();
			});
		}
		return execCommandCopy(text) ? Promise.resolve() : Promise.reject();
	}

	function flash(tile) {
		tile.classList.add("emo__tile--flash");
		setTimeout(function () { tile.classList.remove("emo__tile--flash"); }, 220);
	}

	function renderBuilder() {
		builderInput.value = builderChars.join("");
	}

	function handleTileClick(tile) {
		var ch = tile.getAttribute("data-emoji");
		var item = findItem(ch);
		if (!item) return;
		copyToClipboard(ch).then(function () {
			toast("Copied " + ch);
		}, function () {
			toast("Couldn't copy — press Ctrl/Cmd+C");
		});
		flash(tile);
		builderChars.push(ch);
		renderBuilder();
		pushRecent(ch);
	}

	document.addEventListener("click", function (e) {
		var expandBtn = e.target.closest ? e.target.closest(".emo__tile-expand") : null;
		if (expandBtn) { openZoom(expandBtn.getAttribute("data-expand"), expandBtn.getAttribute("data-expand-name")); return; }
		var tile = e.target.closest ? e.target.closest(".emo__tile") : null;
		if (tile) handleTileClick(tile);
	});

	/* ---- search + builder wiring ---------------------------------------- */

	searchEl.addEventListener("input", applySearch);

	$("emo-builder-copy").addEventListener("click", function () {
		if (!builderInput.value) return;
		copyToClipboard(builderInput.value).then(function () {
			toast("Copied " + builderInput.value);
		}, function () {
			builderInput.select();
			toast("Couldn't copy — press Ctrl/Cmd+C");
		});
	});
	$("emo-builder-clear").addEventListener("click", function () {
		builderChars = [];
		renderBuilder();
		builderInput.focus();
	});

	/* ---- expand to large transparent PNG -------------------------------- */

	var zoom = $("emo-zoom"), zoomImg = $("emo-zoom-img"), zoomTitle = $("emo-zoom-title");
	var zoomSizes = document.querySelectorAll(".emo-zoom__size");
	var currentEmoji = "", currentName = "", currentSize = 1024;
	var lastFocused = null;

	// draws the emoji onto an offscreen canvas at `size`x`size` using the
	// browser's own color-emoji font -- canvas has no fill rect, so the PNG
	// it exports keeps a real alpha-transparent background
	function renderEmojiCanvas(emoji, size) {
		var canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		var ctx = canvas.getContext("2d");
		ctx.font = Math.round(size * 0.78) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
		return canvas;
	}

	// the preview's on-screen size scales with the chosen export resolution too --
	// otherwise the size buttons only change an invisible property (the canvas
	// pixel dimensions baked into the exported PNG) and clicking them looks like
	// it does nothing at all
	var PREVIEW_EM = { 512: 11, 1024: 15, 2048: 19 };
	function renderZoomPreview() {
		zoomImg.src = renderEmojiCanvas(currentEmoji, currentSize).toDataURL("image/png");
		var em = PREVIEW_EM[currentSize] || 15;
		zoomImg.style.width = zoomImg.style.height = em + "em";
	}

	function openZoom(emoji, name) {
		currentEmoji = emoji;
		currentName = name || "";
		zoomTitle.textContent = currentName;
		renderZoomPreview();
		zoom.classList.remove("hide");
		document.body.style.overflow = "hidden";
		lastFocused = document.activeElement;
		$("emo-zoom-close").focus();
	}
	function closeZoom() {
		zoom.classList.add("hide");
		document.body.style.overflow = "";
		if (lastFocused && lastFocused.focus) lastFocused.focus();
	}

	$("emo-zoom-close").addEventListener("click", closeZoom);
	zoom.addEventListener("click", function (e) { if (e.target === zoom) closeZoom(); });
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && !zoom.classList.contains("hide")) closeZoom();
	});

	for (var zi = 0; zi < zoomSizes.length; zi++) {
		zoomSizes[zi].addEventListener("click", function () {
			for (var j = 0; j < zoomSizes.length; j++) zoomSizes[j].classList.remove("emo-zoom__size--active");
			this.classList.add("emo-zoom__size--active");
			currentSize = parseInt(this.getAttribute("data-size"), 10);
			renderZoomPreview();
		});
	}

	function slugify(name) {
		return (name || "emoji").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "emoji";
	}

	$("emo-zoom-download").addEventListener("click", function () {
		var canvas = renderEmojiCanvas(currentEmoji, currentSize);
		var a = document.createElement("a");
		a.download = "emoji-" + slugify(currentName) + "-" + currentSize + ".png";
		a.href = canvas.toDataURL("image/png");
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	});

	$("emo-zoom-copy").addEventListener("click", function () {
		var canvas = renderEmojiCanvas(currentEmoji, currentSize);
		if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === "undefined") {
			toast("Copy image isn't supported in this browser — try Download instead");
			return;
		}
		canvas.toBlob(function (blob) {
			if (!blob) { toast("Couldn't create the image"); return; }
			navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () {
				toast("Image copied");
			}, function () {
				toast("Couldn't copy image — try Download instead");
			});
		});
	});

	/* ---- boot -------------------------------------------------------- */

	renderCategories();
	renderRecent();
	applySearch();
})();
