/* MES Birthday Personality -- pure text engine (no DOM). Browser global `BP`; node: require('./tool_apps_src/birthday-personality/lib.js').
 * Used by mes.fm/birthday-personality (full profile), mes.fm/birthday and mes.fm/zodiac (a compact card). Tests: node tool_apps_src/birthday-personality-tests.js
 *
 * FOR FUN ONLY. Every sentence here is original writing for mes.fm (not taken or paraphrased from any book). A profile is put together from
 * phrase banks: the sign (12), its decan (36: the sign split into thirds, each with a co-ruling sign of the same element), the cusp (the
 * first / last 3 days of a sign), and the numerology of the day of the month (9). The archetype title is "The <adjective> <noun>": the
 * adjective is unique to the day of the month (31) and the noun comes from the decan's own three nouns (108 nouns, all different), so two days
 * can never share a title (the same day of the month in two months always falls in two different decans). 29 February has its own entry.
 * Sign dates are the usual fixed ranges; the real Sun changes sign on slightly different days each year (the page says so on cusp days). */
(function (root) {
	"use strict";
	var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	function doy(mo, d) { return Math.round((Date.UTC(2000, mo - 1, d) - Date.UTC(2000, 0, 0)) / 86400000); }    // 1..366 in a leap year
	function fromDoy(n) { var t = new Date(Date.UTC(2000, 0, n)); return { mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
	function daysIn(mo) { return new Date(Date.UTC(2000, mo, 0)).getUTCDate(); }        // February = 29 here
	function valid(mo, d) { return mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(mo) && Math.floor(mo) === mo && Math.floor(d) === d; }

	// sign: name, glyph, element, modality, traditional ruler, lucky weekday (the ruler's day), start month/day
	var SIGNS = [
		["Aries", "♈", "Fire", "Cardinal", "Mars", 2, 3, 21], ["Taurus", "♉", "Earth", "Fixed", "Venus", 5, 4, 20], ["Gemini", "♊", "Air", "Mutable", "Mercury", 3, 5, 21],
		["Cancer", "♋", "Water", "Cardinal", "the Moon", 1, 6, 21], ["Leo", "♌", "Fire", "Fixed", "the Sun", 0, 7, 23], ["Virgo", "♍", "Earth", "Mutable", "Mercury", 3, 8, 23],
		["Libra", "♎", "Air", "Cardinal", "Venus", 5, 9, 23], ["Scorpio", "♏", "Water", "Fixed", "Mars", 2, 10, 23], ["Sagittarius", "♐", "Fire", "Mutable", "Jupiter", 4, 11, 22],
		["Capricorn", "♑", "Earth", "Cardinal", "Saturn", 6, 12, 22], ["Aquarius", "♒", "Air", "Fixed", "Saturn", 6, 1, 20], ["Pisces", "♓", "Water", "Mutable", "Jupiter", 4, 2, 19]
	].map(function (r, i) { return { i: i, name: r[0], glyph: r[1] + "︎", element: r[2], modality: r[3], ruler: r[4], weekday: WEEKDAYS[r[5]], start: doy(r[6], r[7]) }; });
	SIGNS.forEach(function (s, i) {
		var next = SIGNS[(i + 1) % 12], end = fromDoy(next.start - 1 < 1 ? 366 : next.start - 1), st = fromDoy(s.start);
		s.len = ((next.start - s.start) + 366) % 366;
		s.dates = MONTHS[st.mo - 1].slice(0, 3) + " " + st.d + " – " + MONTHS[end.mo - 1].slice(0, 3) + " " + end.d;
	});

	// Per-sign phrase banks (original text): openers, strengths, challenges, love, work, advice
	var TXT = {
		Aries: {
			open: ["Aries is the spark that starts the zodiac, and you bring that first-match energy to everything you touch.",
				"Ruled by Mars, you meet life head-on: you would rather knock on the door than wait for it to open.",
				"You are an Aries, which means patience is something you admire, mostly in other people.",
				"Your fire sign burns fast and honest: what you feel shows on your face before you can hide it."],
			str: ["Starts things other people only talk about", "Brave in a crisis", "Refreshingly honest", "Bounces back fast from setbacks", "Protective of friends", "Energy that lifts a whole team"],
			chal: ["Impatience when things move slowly", "A temper that flares and fades quickly", "Starting five projects and finishing two", "Hearing advice as criticism", "Treating every disagreement as a race"],
			love: ["In love you are direct and wholehearted: if you like someone, they will know by Thursday.",
				"You need a partner who can keep up, push back and laugh when you lose a board game badly.",
				"Friendship with you is an adventure, and you defend your friends like family."],
			work: ["At work you shine wherever speed and nerve matter: launches, emergencies, sales, sport, anything with a starting line.",
				"Money tends to arrive in bursts, so a simple automatic savings habit protects you from your own impulse buys.",
				"Give yourself a role with visible wins, or you will invent a competition just to feel alive."],
			adv: ["Count to ten, then still go first.", "Finish one brave thing before you start the next.", "Let someone else win the small races."]
		},
		Taurus: {
			open: ["Taurus is the zodiac's gardener, and you grow your life the way a good garden grows: steadily, seasonally, without fuss.",
				"Venus rules your sign, so beauty, comfort and good food are not luxuries to you; they are necessities.",
				"You are calm on the outside and immovable on the inside once your mind is made up.",
				"As an earth sign, you trust what is real: what can be touched, tasted, counted and kept."],
			str: ["Reliable when it matters most", "Patient with long projects", "An excellent eye for quality", "Calm under pressure", "Loyal for life", "Practical with money"],
			chal: ["Stubbornness dressed up as principle", "Resisting change long after it has arrived", "Holding on to things, and grudges, too long", "Comfort that slowly becomes a rut", "Saying “fine” when it is not"],
			love: ["In love you are affectionate, steady and sensual; you remember exactly how someone takes their tea.",
				"You fall slowly and stay long, and you need a partner who values loyalty as much as you do.",
				"Friends rely on you as the one who always shows up, usually with snacks."],
			work: ["You do well in careers that reward patience and taste: finance, food, design, building, music, land and anything that grows in value.",
				"Money means security to you, and a slow, sensible plan suits you far better than a hot tip.",
				"You are the colleague who quietly finishes what everyone else abandoned."],
			adv: ["Try one new thing a month, on purpose.", "Let go of what no longer feeds you.", "Comfort is a gift; just do not let it become a fence."]
		},
		Gemini: {
			open: ["Gemini is the zodiac's conversation, and you are always halfway through an interesting one.",
				"Mercury rules your sign, so your mind moves quickly and your words move even faster.",
				"You are a Gemini, which means two good ideas before breakfast and three more by lunch.",
				"As an air sign, you live among ideas, news, jokes and the connections between people."],
			str: ["Quick-witted and funny", "Learns new skills fast", "Can talk to anyone", "Adapts easily to change", "Brings people together", "Sees both sides of a question"],
			chal: ["Losing interest once the novelty fades", "Scattering energy across too many plans", "Talking about feelings instead of feeling them", "Restlessness when life turns routine", "Telling a story better than it happened"],
			love: ["In love you need a partner who is also a friend, someone you can talk to until two in the morning.",
				"Variety keeps your heart engaged: shared trips, new restaurants, silly debates over dinner.",
				"Your friendships are many and lively, and you somehow remember everyone's news."],
			work: ["You thrive in roles full of words and people: writing, teaching, media, sales, coding, anything with variety.",
				"Your income may come from more than one source, which suits you, as long as you keep track of it.",
				"A to-do list is your best friend and your favourite thing to ignore."],
			adv: ["Pick one thing and see it all the way through.", "Listen as fast as you talk.", "Your curiosity is a gift; give it some depth too."]
		},
		Cancer: {
			open: ["Cancer is the zodiac's home, and you carry a little of that warmth with you wherever you go.",
				"Ruled by the Moon, your moods have tides, and so does your intuition, which is usually right.",
				"You are a Cancer: soft at the centre, protected by a shell that took years to build.",
				"As a water sign, you feel the emotional weather of a room before anyone says a word."],
			str: ["Deeply caring", "A memory for what matters to people", "Strong intuition", "Fiercely protective", "Makes anywhere feel like home", "Loyal through hard times"],
			chal: ["Taking things personally", "Retreating into your shell when hurt", "Worrying about people you cannot control", "Holding on to the past", "Mood swings that confuse others"],
			love: ["In love you are devoted and nurturing, and you need to feel safe before you open up completely.",
				"Small gestures mean everything to you, and you never forget an anniversary.",
				"Your friends become family, and family is the centre of your world."],
			work: ["You do well where care and instinct count: health, teaching, food, hospitality, property, history and family businesses.",
				"Money is about security for you; a well-stocked savings account is what lets you sleep.",
				"You lead like a good parent: protective, demanding and proud of your team."],
			adv: ["Say what you need instead of hoping people guess.", "The past is a good teacher and a poor place to live.", "Look after yourself as well as you look after everyone else."]
		},
		Leo: {
			open: ["Leo is the zodiac's sunshine, and people tend to feel a little warmer around you.",
				"Ruled by the Sun itself, you were made to shine and, at your best, to help others shine too.",
				"You are a Leo: generous, dramatic and very hard to ignore.",
				"As a fire sign, you bring heat, colour and a sense of occasion to ordinary days."],
			str: ["Generous with time and praise", "Natural confidence", "Creative and expressive", "Loyal and warm", "Leads by example", "Makes ordinary moments feel special"],
			chal: ["Needing applause a little too much", "Pride that makes apologies hard", "Taking over the conversation", "Stubbornness when your ego is bruised", "Spending to impress"],
			love: ["In love you are romantic and big-hearted; you plan surprises and expect a little adoration in return.",
				"You need a partner who admires you and is secure enough not to compete for the spotlight.",
				"Your friends know you as the one who throws the party and remembers every birthday."],
			work: ["You shine where you can lead, create or perform: management, entertainment, teaching, design, politics and anything with a stage.",
				"Money comes and goes with flair; a budget that leaves room for fun is the one you will actually keep.",
				"Praise motivates you more than a pay rise, though you would happily take both."],
			adv: ["Let others take a bow too.", "Your heart is your crown; wear it kindly.", "Quiet confidence carries further than a roar."]
		},
		Virgo: {
			open: ["Virgo is the zodiac's craftsperson, and you notice every detail, including a few you wish you had not.",
				"Ruled by Mercury, your mind is sharp, analytical and always looking for a better way.",
				"You are a Virgo: modest about your gifts and surprisingly funny once people get to know you.",
				"As an earth sign, you show love through action: fixing, tidying, helping, remembering."],
			str: ["Precise and thorough", "A practical problem-solver", "Helpful without being asked", "Gives honest feedback", "Organised under pressure", "Learns from every mistake"],
			chal: ["Perfectionism that delays finishing", "Being your own harshest critic", "Worrying about small things", "Finding it hard to accept help", "Correcting people who did not ask"],
			love: ["In love you are attentive and sincere, and you show devotion in a hundred small, practical ways.",
				"You need a partner who appreciates care that is quiet rather than showy.",
				"Friends come to you for advice and leave with a plan."],
			work: ["You do well wherever accuracy matters: health, science, editing, accounting, engineering, craft and service.",
				"You are careful with money and good at finding the best value, sometimes after reading every single review.",
				"You are the one who spots the mistake before it costs anything."],
			adv: ["Done is a kind of perfect too.", "Give yourself the patience you give others.", "Not every flaw needs fixing; some just need love."]
		},
		Libra: {
			open: ["Libra is the zodiac's balance, and you spend your life weighing what is fair, kind and beautiful.",
				"Ruled by Venus, you have a gift for charm, harmony and making hard things look effortless.",
				"You are a Libra: sociable, gracious and sometimes stuck between two equally good options.",
				"As an air sign, you think in relationships: you see how people, ideas and colours fit together."],
			str: ["Fair-minded", "Gracious and charming", "A natural mediator", "A strong sense of style", "A good listener", "Brings out the best in a partner"],
			chal: ["Indecision when choices are close", "Avoiding conflict until it grows", "Putting other people's wishes first", "Caring a lot about appearances", "Saying yes just to keep the peace"],
			love: ["In love you are romantic and attentive; you believe partnership is one of life's great arts.",
				"You need a partner who talks things through and appreciates a beautiful evening.",
				"As a friend you are everyone's favourite plus-one and the calm voice in any quarrel."],
			work: ["You do well in roles that need diplomacy and taste: law, design, mediation, fashion, people management, the arts and public relations.",
				"Money is easiest for you with a partner or a clear plan; impulse shopping for lovely things is the risk.",
				"You make a group of colleagues feel like a team."],
			adv: ["Make the choice; balance comes after.", "Peace that hides problems is not peace.", "Your opinion counts too, so say it."]
		},
		Scorpio: {
			open: ["Scorpio is the zodiac's deep water, and very few people ever see how far down you go.",
				"Traditionally ruled by Mars, you have quiet power and a will that does not bend easily.",
				"You are a Scorpio: magnetic, private and impossible to fool for long.",
				"As a water sign, you feel things intensely, though you may show only a fraction of it."],
			str: ["Determined and resilient", "Sees through pretence", "Fiercely loyal", "Keeps secrets safe", "Brave about hard truths", "Turns setbacks into strength"],
			chal: ["Jealousy and suspicion", "Holding grudges", "A need for control", "Testing people before trusting them", "Keeping feelings bottled up"],
			love: ["In love you are intense and devoted; you want depth, honesty and nothing lukewarm.",
				"Trust is everything to you, and once broken it is very hard to rebuild.",
				"You have few close friends, and you would do anything for each of them."],
			work: ["You thrive where depth and focus matter: research, investigation, medicine, psychology, finance and crisis work.",
				"You are strategic with money and good at quietly building reserves.",
				"Give you a mystery and you will not sleep until it is solved."],
			adv: ["Let one person all the way in.", "Forgiveness is a power move too.", "Not everything needs to be a test."]
		},
		Sagittarius: {
			open: ["Sagittarius is the zodiac's explorer, and your mind is usually already somewhere further away.",
				"Ruled by Jupiter, the planet of growth, you expect life to be generous, and quite often it is.",
				"You are a Sagittarius: honest, funny and always up for the trip.",
				"As a fire sign, you burn with enthusiasm for ideas, places and people who make you think."],
			str: ["Optimistic", "Adventurous", "Honest and open", "A great sense of humour", "Loves to learn and to teach", "A generous spirit"],
			chal: ["Bluntness that stings", "Restlessness and commitment nerves", "Overpromising", "Impatience with details", "Preaching when you mean to share"],
			love: ["In love you need freedom and a partner who is also a travel buddy and a debating partner.",
				"You fall fast for a brilliant mind and stay for the laughter.",
				"Your friends come from everywhere, and you keep in touch from anywhere."],
			work: ["You do well where learning, travel and big ideas meet: teaching, publishing, law, tourism, sport and anything international.",
				"Money tends to flow out on experiences; a dedicated travel fund keeps your two loves on speaking terms.",
				"You need a mission bigger than the pay cheque."],
			adv: ["Stay long enough to see what grows.", "Truth lands softer with a little tact.", "Small promises kept beat big ones forgotten."]
		},
		Capricorn: {
			open: ["Capricorn is the zodiac's mountain climber, and you tend to reach the top by simply never stopping.",
				"Ruled by Saturn, you understand time, effort and the value of things that last.",
				"You are a Capricorn: serious when needed, funny when you choose to be, and much warmer than you look.",
				"As an earth sign, you build things: careers, families, savings and reputations, one solid brick at a time."],
			str: ["Disciplined", "Responsible", "Patient with long goals", "Dry, clever humour", "A practical leader", "Keeps promises"],
			chal: ["Working too much", "Pessimism dressed up as realism", "Finding it hard to relax", "Being hard on yourself", "Keeping feelings formal"],
			love: ["In love you are loyal and steady, slow to commit and very hard to shake once you have.",
				"You show love by providing, planning and showing up, year after year.",
				"Your friends are few but long-standing, and you help them in practical ways."],
			work: ["You do well where responsibility and long-term planning matter: management, finance, government, engineering, law and building anything from scratch.",
				"You are careful with money and very good at playing the long game.",
				"Titles matter less to you than results, though you would not say no to both."],
			adv: ["Rest is part of the climb.", "Celebrate the halfway point.", "Let people see the warmth behind the work."]
		},
		Aquarius: {
			open: ["Aquarius is the zodiac's free thinker, and you have never been very interested in doing things the usual way.",
				"Traditionally ruled by Saturn, you mix steady principles with surprisingly radical ideas.",
				"You are an Aquarius: friendly to all, fully understood by few, and fine with that.",
				"As an air sign, you live in ideas, especially the ones about how the world could work better."],
			str: ["An original thinker", "Fair and humane", "A loyal friend", "Independent", "Good with technology and systems", "Calm in a storm"],
			chal: ["Detachment when emotions run high", "Stubbornness about your ideas", "Rebelling for its own sake", "Unpredictability", "Caring for humanity more easily than for one person"],
			love: ["In love you need a best friend first, and space to remain your own person.",
				"You are loyal in an unusual way: you may forget an anniversary, but never a promise.",
				"Your friendships cross every kind of border, and you value them deeply."],
			work: ["You do well where new ideas matter: science, technology, social causes, design, media and anything that has not been invented yet.",
				"Money is a tool for freedom to you; the right investment is one that buys you choices.",
				"You work best towards a goal that helps more people than just you."],
			adv: ["Let someone close see your heart.", "Being different is a gift; being kind is a bigger one.", "Not every rule is wrong, so choose your rebellions."]
		},
		Pisces: {
			open: ["Pisces is the zodiac's ocean, where the colours of every other sign meet and blend, and you feel all of them.",
				"Traditionally ruled by Jupiter, you have a generous, forgiving heart and an enormous imagination.",
				"You are a Pisces: dreamy, kind and wiser than you let on.",
				"As a water sign, you read feelings the way other people read street signs."],
			str: ["Compassionate", "Imaginative", "Intuitive", "Artistic", "Adaptable", "Forgiving"],
			chal: ["Escaping when life gets hard", "Weak boundaries", "Saying yes to everyone", "Feeling flooded by other people's moods", "Avoiding practical details"],
			love: ["In love you are romantic and devoted, and you see the best in people, sometimes more than they show.",
				"You need a gentle partner who protects your dreamy side instead of laughing at it.",
				"Your friends feel truly understood when they are around you."],
			work: ["You do well where empathy and imagination count: art, music, healing, care, film, spiritual and charitable work.",
				"Money can slip through your fingers; a simple automatic budget gives your dreams a floor to stand on.",
				"You need work with meaning, because a pay cheque alone will never be enough."],
			adv: ["Boundaries are a form of kindness.", "Bring one dream down to earth this month.", "Your sensitivity is a strength; protect it."]
		}
	};

	// Decans: [nouns x3, "of ..." endings x2, sentences x2, lucky colour, mottos x2, strength]
	var DEC = {
		Aries: [
			[["Trailblazer", "Spark", "Vanguard"], ["of First Light", "of the Open Road"],
				["Born in the opening days of the zodiac's first sign, you have the energy of a starting gun: things begin when you arrive.", "You would rather try and fail loudly than wait politely for permission."],
				"scarlet", ["Begin before you feel ready.", "The first step is the only one I need to see."], "Acts while others are still deciding"],
			[["Champion", "Torchbearer", "Showrunner"], ["of Bright Causes", "of the Main Stage"],
				["A Leo note in your fire adds warmth and a love of the spotlight to Aries courage.", "You lead best when there is an audience to inspire and a cause worth the noise."],
				"flame orange", ["If it matters, say it out loud.", "Light the way, then pass the torch."], "Rallies people to a cause"],
			[["Adventurer", "Frontier Scout", "Daredevil"], ["of Far Horizons", "of Wild Ideas"],
				["The Sagittarius thread in your decan turns raw drive into a hunger for distance, meaning and big ideas.", "You are happiest when a plan is half adventure and half philosophy."],
				"ember red", ["The map ends where the fun starts.", "Go far, come back wiser."], "Turns risk into a good story"]
		],
		Taurus: [
			[["Gardener", "Keeper", "Cornerstone"], ["of Slow Seasons", "of Good Things"],
				["Early Taurus days bring a deep, unhurried strength: you grow plants, people and savings at the speed they actually grow.", "You trust what you can touch, taste and test for yourself."],
				"moss green", ["Good things are worth the wait.", "Root first, then rise."], "Makes things grow"],
			[["Artisan", "Steward", "Mender"], ["of Fine Details", "of Useful Beauty"],
				["A Virgo undertone makes you a perfectionist with a soft touch, the person who fixes the wobbly table and then polishes it.", "Your taste is excellent, and you can explain exactly why."],
				"sage green", ["Do it well or do it twice.", "Beauty should also work."], "Skilled with your hands"],
			[["Architect", "Treasurer", "Stonemason"], ["of Lasting Things", "of the Long Game"],
				["With Capricorn shading your decan, the love of comfort becomes ambition: you want a life that will still be standing in fifty years.", "You plan in decades and rarely panic in days."],
				"earth brown", ["Build it to outlast me.", "Steady wins, eventually and completely."], "Thinks in decades"]
		],
		Gemini: [
			[["Messenger", "Storyteller", "Juggler"], ["of Quick Words", "of a Thousand Questions"],
				["The first Gemini days hum with curiosity; you collect facts, friends and open browser tabs at the same pace.", "Boredom is the only thing you truly fear."],
				"lemon yellow", ["Ask one more question.", "Every room has a conversation waiting."], "Explains anything simply"],
			[["Diplomat", "Matchmaker", "Charmer"], ["of Easy Company", "of Clever Balance"],
				["A Libra breeze softens Gemini wit into charm: you could talk two rivals into having lunch together.", "You think best out loud, with someone across the table."],
				"sky blue", ["There is always a kinder way to say it.", "Two minds are better than my one."], "Smooths over awkward moments"],
			[["Inventor", "Futurist", "Free Thinker"], ["of Odd Ideas", "of Tomorrow"],
				["With Aquarius in the mix, your mind races ahead of the crowd and comes back with inventions nobody asked for, yet.", "You are friendly with everyone and predictable to no one."],
				"electric teal", ["Weird is just early.", "Change the question."], "Spots trends early"]
		],
		Cancer: [
			[["Guardian", "Hearth Keeper", "Nurturer"], ["of the Home Fires", "of Small Kindnesses"],
				["Born as the days are longest, you hold on to people and memories with the same fierce tenderness.", "Home, for you, is less a place than the people you have decided to protect."],
				"pearl white", ["Feed people first, then argue.", "My door stays open."], "Makes people feel safe"],
			[["Confidant", "Tidecaller", "Secret Keeper"], ["of Deep Waters", "of Quiet Loyalty"],
				["A Scorpio current runs beneath your gentle Cancer surface, adding intuition and a memory that forgets nothing.", "People tell you things they have never told anyone else."],
				"sea green", ["Feelings are information.", "What is shared with me stays with me."], "Trusted with secrets"],
			[["Poet", "Healer", "Lighthouse"], ["of Gentle Tides", "of Remembered Songs"],
				["Pisces in your decan makes you imaginative and deeply empathic, the friend who senses a bad day before a word is said.", "You turn feelings into art, meals, letters or music."],
				"silver blue", ["Softness is not weakness.", "Every hurt can teach a song."], "Comforts without words"]
		],
		Leo: [
			[["Sovereign", "Performer", "Lionheart"], ["of the Golden Hour", "of Big Gestures"],
				["Early Leos shine without trying; a room seems to turn slightly towards you when you walk in.", "You love generously, loudly and with a real sense of occasion."],
				"gold", ["Shine so others feel brave enough to.", "Go big, with heart."], "Lights up a room"],
			[["Ringmaster", "Optimist", "Bard"], ["of Grand Adventures", "of Good Fortune"],
				["A Sagittarius flame adds wanderlust and humour to Leo pride; you make every trip and every story bigger.", "Your optimism is contagious, and now and then a little reckless."],
				"sunset orange", ["Say yes to the story.", "Luck likes the bold."], "Turns plans into celebrations"],
			[["Commander", "Firebrand", "Hero"], ["of Brave Choices", "of the Front Line"],
				["Aries energy in your decan makes your Leo warmth decisive: you do not just admire courage, you go first.", "You protect the underdog almost by reflex."],
				"crimson", ["Courage is a choice I make daily.", "Stand up, then stand by them."], "Stands up for the underdog"]
		],
		Virgo: [
			[["Analyst", "Editor", "Problem Solver"], ["of Small Miracles", "of Clean Lines"],
				["Early Virgos notice what everyone else misses: the typo, the loose thread, the friend who has gone quiet.", "You show love by being useful."],
				"wheat", ["Details are where care lives.", "Leave it better than I found it."], "Notices what others miss"],
			[["Engineer", "Strategist", "Clockmaker"], ["of Working Systems", "of Tomorrow's Plans"],
				["A Capricorn layer makes your precision ambitious: you design systems that keep working long after you have left the room.", "You stay calm in a crisis because you already wrote the checklist."],
				"slate grey", ["A good plan is a kindness to my future self.", "Measure twice, live once."], "Designs systems that last"],
			[["Herbalist", "Caretaker", "Naturalist"], ["of Green Things", "of Honest Work"],
				["Taurus earth in your decan slows Virgo worry into patient craft; you are at your best with your hands busy.", "You find peace in routines that other people call boring."],
				"olive", ["Tend the garden in front of me.", "Simple, done well, every day."], "Finds calm in routine"]
		],
		Libra: [
			[["Peacemaker", "Aesthete", "Host"], ["of Fair Play", "of Beautiful Rooms"],
				["Born near the equinox, when day and night are equal, you are built for balance and allergic to unfairness.", "You can make a stranger feel like the guest of honour."],
				"rose pink", ["Fair first, then fast.", "Make the space lovely and the people welcome."], "Makes everyone feel welcome"],
			[["Reformer", "Idealist", "Bridge Builder"], ["of Better Rules", "of Common Ground"],
				["An Aquarius current pushes your Libra fairness outwards: you want justice for strangers, not just harmony at home.", "You argue for the people who are not in the room."],
				"periwinkle", ["Better is possible.", "Build the bridge, then walk it first."], "Speaks up for fairness"],
			[["Wordsmith", "Negotiator", "Socialite"], ["of Witty Replies", "of Second Chances"],
				["With Gemini in your decan, your charm comes with a quick tongue: you can win the argument and keep the friend.", "You are rarely short of an invitation or an opinion."],
				"lilac", ["Every story has another side.", "Say it kindly, say it well."], "Wins arguments gracefully"]
		],
		Scorpio: [
			[["Alchemist", "Detective", "Phoenix"], ["of Hidden Truths", "of Second Lives"],
				["Early Scorpios are intense and private, with a talent for seeing what is really happening under the surface.", "You do nothing halfway, loyalty included."],
				"deep burgundy", ["The truth is usually one layer down.", "Burn it down, grow it back better."], "Reinvention after a setback"],
			[["Mystic", "Seer", "Night Swimmer"], ["of Midnight Thoughts", "of Unspoken Things"],
				["Pisces shading gives your Scorpio depth a dreamy, almost psychic edge; your hunches are right often enough to be unnerving.", "You need time alone the way other people need sleep."],
				"indigo", ["Trust the quiet voice.", "Still water, deep roots."], "Hunches that turn out right"],
			[["Protector", "Sentinel", "Loyalist"], ["of the Inner Circle", "of Kept Promises"],
				["Cancer in your decan turns Scorpio intensity into fierce protection of the few people you let all the way in.", "Anyone who hurts your family will meet a very different side of you."],
				"wine red", ["My people, my promise.", "Loyalty is my first language."], "Defends the people you love"]
		],
		Sagittarius: [
			[["Explorer", "Archer", "Wanderer"], ["of Open Skies", "of Big Questions"],
				["Early Sagittarians aim far; you are drawn to travel, teaching and anything that makes the world feel bigger.", "Honesty comes out of you fast, sometimes before tact has caught up."],
				"royal purple", ["Aim high, pack light.", "Go and see for myself."], "Makes the world feel bigger"],
			[["Crusader", "Maverick", "Pathfinder"], ["of Bold Truths", "of Unmapped Places"],
				["Aries fire in your decan sharpens Sagittarius optimism into action: you do not just dream about the trip, you book it.", "You grow restless when life stands still for too long."],
				"turquoise", ["Fortune favours the packed bag.", "If not now, then soon, but probably now."], "Turns dreams into tickets"],
			[["Philosopher", "Entertainer", "Teacher"], ["of Joyful Lessons", "of the Long Table"],
				["With Leo warmth in your decan, your wisdom comes wrapped in humour; people learn from you without noticing they are being taught.", "You are generous with laughter, advice and dessert."],
				"plum", ["Teach with a smile.", "Laughter is the best lecture."], "Teaches without preaching"]
		],
		Capricorn: [
			[["Mountaineer", "Timekeeper", "Chieftain"], ["of Quiet Summits", "of Long Winters"],
				["Born as the year turns dark and cold, you have a winter kind of strength: patient, practical and very hard to knock over.", "You took life seriously early, and you tend to enjoy it more with every passing year."],
				"charcoal", ["One handhold at a time.", "Earn it, keep it."], "Endures what others quit"],
			[["Founder", "Patron", "Provider"], ["of New Beginnings", "of Solid Ground"],
				["A Taurus note gives Capricorn ambition a love of comfort and quality: you work hard so that life can be beautiful, eventually.", "You are a reliable friend with excellent taste in shoes and investments."],
				"forest green", ["Build the table, then invite everyone.", "Slow money is good money."], "Builds security for others"],
			[["Mastermind", "Navigator", "Pillar"], ["of Hard Problems", "of Quiet Excellence"],
				["Virgo precision in your decan makes your Capricorn drive meticulous; you are the one a team relies on when the stakes are high.", "Your humour is dry enough to miss, which is half of its charm."],
				"steel grey", ["Quietly, thoroughly, completely.", "Trust the plan I drew."], "Calm when the stakes are high"]
		],
		Aquarius: [
			[["Visionary", "Rebel", "Humanitarian"], ["of the Next Big Thing", "of Free Minds"],
				["Early Aquarians are original by default; you see where the world is heading and wonder why everyone else is standing still.", "You care about humanity in general and need plenty of space in particular."],
				"electric blue", ["The future needs a first draft.", "Be kind, be strange, be free."], "Sees where things are heading"],
			[["Tinkerer", "Networker", "Wit"], ["of Bright Sparks", "of Many Friends"],
				["Gemini air in your decan makes your Aquarian mind sociable and quick; you connect people and ideas that would never otherwise have met.", "Routine bores you, and a clever problem wakes you right up."],
				"aqua", ["Connect the dots, then the people.", "Curiosity is my compass."], "Connects people and ideas"],
			[["Activist", "Ambassador", "Kindred Spirit"], ["of Gentle Revolutions", "of Fair Futures"],
				["Libra grace in your decan softens Aquarian independence: you want to change the world and charm it while you do.", "You are more romantic than you let most people know."],
				"lavender blue", ["Change the world politely, but change it.", "Kindness is my rebellion."], "Changes minds without a fight"]
		],
		Pisces: [
			[["Dreamweaver", "Muse", "Empath"], ["of Soft Light", "of Endless Oceans"],
				["Early Pisceans feel everything: the mood of a room, the sadness in a song, the thing a friend did not quite say.", "Your imagination is a safe harbour, and sometimes a place to hide."],
				"seafoam", ["Feel it all, then make something.", "Dreams are plans in disguise."], "Inspires other people's creativity"],
			[["Comforter", "Storykeeper", "Shepherd"], ["of Kind Hands", "of Old Stories"],
				["A Cancer tide in your decan turns Piscean empathy into practical caring: you show up with soup, not just sympathy.", "Family, chosen or born, is where your heart lives."],
				"lagoon blue", ["Be the soft place to land.", "Kindness first, questions later."], "Shows up when it counts"],
			[["Enchanter", "Deep Diver", "Prophet"], ["of the Final Tide", "of Hidden Currents"],
				["Born as the zodiac comes full circle, with Scorpio intensity in your decan, you understand endings, transformations and the magic in between.", "You see patterns and meanings that others walk straight past."],
				"violet", ["Every ending is a door.", "Swim deeper."], "Sees meaning in patterns"]
		]
	};

	// Day of the month: adjective (unique per day 1..31, indexed by [day number][k = floor((day - 1) / 9)]), motto, and per-number banks
	var ADJ = { 1: ["Bold", "Fearless", "Unstoppable", "Self-Made"], 2: ["Gentle", "Intuitive", "Devoted", "Tender"], 3: ["Radiant", "Playful", "Bright", "Spirited"],
		4: ["Steadfast", "Patient", "Tireless", "Grounded"], 5: ["Restless", "Curious", "Quicksilver"], 6: ["Loyal", "Warm-Hearted", "Generous"],
		7: ["Quiet", "Watchful", "Thoughtful"], 8: ["Determined", "Unshakable", "Ambitious"], 9: ["Wise", "Compassionate", "Far-Seeing"] };
	var DAYMOTTO = { 1: ["First in, last to give up.", "I make my own luck, then share it.", "Stand alone if you must, but stand.", "Built by me, open to all."],
		2: ["Kindness is a quiet kind of strength.", "Trust the voice beneath the noise.", "Together is my favourite place.", "Gentle hands move mountains."],
		3: ["Joy is worth taking seriously.", "Play is how I learn.", "Say it with colour.", "Life is better out loud."],
		4: ["Steady hands, steady heart.", "Slow and sure, every time.", "Dream big, build bigger.", "Feet on the ground, eyes on the work."],
		5: ["Change is my oldest friend.", "Every road has a story.", "Keep moving, keep learning."],
		6: ["Love shows up.", "Take care of the ones who take care.", "There is always room at my table."],
		7: ["Still waters think deep.", "Look closer.", "The question is the adventure."],
		8: ["Make it happen, make it last.", "Strength is quiet until it is needed.", "Aim high and keep score."],
		9: ["The world is my neighbourhood.", "Every person is a world.", "See far, act near."] };
	var NUM = {
		1: { name: "the starter", sum: ["Your day number, 1, adds an independent streak: you would rather build your own path than walk someone else's.", "Day number 1 gives you a self-starter's engine and a strong dislike of being told what to do."],
			str: ["Self-motivated", "Original thinking", "Decisive under pressure"], chal: ["Going it alone too often", "Impatience with slower people", "Pride that resists help"],
			love: ["You need a partner who respects your independence and cheers on your plans.", "You tend to make the first move, and you rarely regret it."],
			work: ["Self-employment, start-ups and leadership roles suit your number.", "You earn best when you are allowed to steer."],
			adv: ["Ask for help once in a while; it is still your win.", "Lead, and leave space for others to lead too."] },
		2: { name: "the partner", sum: ["Your day number, 2, adds tact and sensitivity: you read people well and work best in partnership.", "Day number 2 makes you a natural diplomat, alert to the smallest change in someone's mood."],
			str: ["Tactful", "Cooperative", "Reads people well"], chal: ["Oversensitivity", "Putting yourself last", "Fear of confrontation"],
			love: ["Partnership is where your number is happiest, and you notice the small changes in the people you love.", "You give a lot, so choose people who give back."],
			work: ["You make an outstanding second-in-command, negotiator or collaborator.", "Teamwork multiplies your income more than solo sprints do."],
			adv: ["Your needs belong in the conversation too.", "Choose partners who match your loyalty."] },
		3: { name: "the communicator", sum: ["Your day number, 3, adds sparkle and self-expression: words, colour and laughter come easily to you.", "Day number 3 gives you a playful, creative streak that makes even chores feel like a performance."],
			str: ["Expressive", "Funny", "Creative"], chal: ["Scattered energy", "Exaggeration", "Moodiness when ignored"],
			love: ["You flirt with words and laughter, and you need a partner who enjoys your jokes.", "Love has to stay fun for you, or it fades."],
			work: ["Creative, social and communication work pays you in both money and joy.", "Your best ideas arrive when you talk them out."],
			adv: ["Finish the song before you start the next one.", "Your voice matters, so use it for what you love."] },
		4: { name: "the builder", sum: ["Your day number, 4, adds steadiness: you like plans, foundations and things that are built properly.", "Day number 4 gives you a builder's patience and a firm sense of right and wrong."],
			str: ["Hard-working", "Dependable", "Organised"], chal: ["Rigidity", "Overwork", "Suspicion of shortcuts, even good ones"],
			love: ["You are a steady, faithful partner who prefers deeds to declarations.", "Trust, for you, is built one kept promise at a time."],
			work: ["You thrive on structure, systems and solid craftsmanship.", "Slow, steady saving suits your number very well."],
			adv: ["Leave room in the plan for surprises.", "Build, then rest in what you built."] },
		5: { name: "the free spirit", sum: ["Your day number, 5, adds restlessness and curiosity: you learn by doing, trying and occasionally breaking things.", "Day number 5 gives you a love of freedom and a talent for adapting to whatever happens next."],
			str: ["Adaptable", "Adventurous", "A quick learner"], chal: ["Restlessness", "Impulsiveness", "Avoiding commitments"],
			love: ["You need variety and a partner who loves surprises as much as you do.", "Freedom inside a relationship is what keeps you in it."],
			work: ["Travel, sales, media and anything fast-changing suit your number.", "Keep a safety net, because your number loves a sudden change of direction."],
			adv: ["Freedom grows stronger with a few roots.", "Try the new thing, and keep the good old ones."] },
		6: { name: "the carer", sum: ["Your day number, 6, adds warmth and responsibility: you are the one who makes sure everyone has eaten.", "Day number 6 gives you a caretaker's heart and a keen eye for harmony and beauty."],
			str: ["Nurturing", "Responsible", "An eye for beauty"], chal: ["Worrying", "Meddling out of love", "Self-sacrifice"],
			love: ["You are the caretaker of every relationship, and you love deeply and domestically.", "Home and family sit at the very centre of your heart."],
			work: ["Teaching, health, design and service roles reward your caring number.", "You often earn by helping others feel at home."],
			adv: ["Care for yourself the way you care for your people.", "Love does not have to fix everything."] },
		7: { name: "the seeker", sum: ["Your day number, 7, adds depth: you need quiet time to think, and you are rarely satisfied with easy answers.", "Day number 7 gives you a searching, analytical mind and a rich private inner world."],
			str: ["Insightful", "Analytical", "An independent mind"], chal: ["Aloofness", "Overthinking", "Secrecy"],
			love: ["You need a partner who understands your need for quiet and who thinks deeply too.", "You open up slowly, but when you do it is for real."],
			work: ["Research, analysis, writing and specialist work suit your searching number.", "You do best in work that lets you think without being interrupted."],
			adv: ["Share a thought before it is perfect.", "Trust your mind, and keep your heart as a second opinion."] },
		8: { name: "the achiever", sum: ["Your day number, 8, adds drive and authority: you understand power, money and how to get things done.", "Day number 8 gives you executive energy and the stamina to keep going when others stop."],
			str: ["Ambitious", "Resilient", "Good with money"], chal: ["Workaholism", "A controlling streak", "Measuring life by results"],
			love: ["You are protective and generous with the people you love, and you expect loyalty back.", "Shared goals bring you closer than candlelit dinners do."],
			work: ["Business, management, finance and law suit your ambitious number.", "Money tends to follow your effort, especially in your middle years."],
			adv: ["Success is sweeter when you stop to enjoy it.", "Lead with generosity and the rest follows."] },
		9: { name: "the humanitarian", sum: ["Your day number, 9, adds compassion and breadth: you think about the big picture and the people in it.", "Day number 9 gives you a generous, idealistic streak and a wisdom beyond your years."],
			str: ["Compassionate", "Broad-minded", "Generous"], chal: ["Taking on other people's burdens", "Disappointment in people", "Difficulty letting go"],
			love: ["You love with an open heart and forgive more than most people would.", "A partner who shares your ideals matters more to you than one who shares your postcode."],
			work: ["Charity, the arts, medicine, teaching and global work suit your number.", "You earn best when your work serves something bigger than yourself."],
			adv: ["Let the past go so the next chapter can start.", "Help the world, starting with the person in front of you."] }
	};
	var NUM_COLOUR = { 1: "gold", 2: "pearl", 3: "sunny yellow", 4: "olive", 5: "turquoise", 6: "rose", 7: "sea green", 8: "deep blue", 9: "crimson" };
	// cusp text, indexed by the LATER sign of the pair
	var CUSP = ["Born on the Pisces–Aries cusp, you blend dreamy intuition with an urge to act on it immediately.",
		"Born on the Aries–Taurus cusp, you combine Aries drive with Taurus staying power: hard to start against, harder to stop.",
		"On the Taurus–Gemini cusp, you mix earthy common sense with a restless, chatty mind.",
		"On the Gemini–Cancer cusp, you think with your head and decide with your heart, often within the same minute.",
		"On the Cancer–Leo cusp, you are both shy and showy: a tender heart that secretly loves an audience.",
		"On the Leo–Virgo cusp, you pair Leo flair with Virgo precision, the creative who also checks the spelling.",
		"On the Virgo–Libra cusp, you are a perfectionist with a sense of beauty, and you want things both right and lovely.",
		"On the Libra–Scorpio cusp, charm meets intensity: you can be the most gracious person in the room and the most determined.",
		"On the Scorpio–Sagittarius cusp, you combine Scorpio depth with Sagittarius daring, a serious mind with a wild streak.",
		"On the Sagittarius–Capricorn cusp, you have big dreams and the discipline to chase them.",
		"On the Capricorn–Aquarius cusp, you are a practical rebel who changes systems from the inside.",
		"On the Aquarius–Pisces cusp, you blend clear, original thinking with very deep feeling."];
	// personal year (numerology: month + day + the digits of the birthday year, reduced to 1..9)
	var PYEAR = { 1: ["a year of fresh starts", "Doors open for new projects, and the first steps you take before your next birthday matter more than usual."],
		2: ["a year of partnership", "Patience and teamwork pay off, and a friendship or partnership may become important."],
		3: ["a year of expression", "Say yes to creative invitations; your words and ideas travel further than you expect."],
		4: ["a year of building", "Lay foundations: the routines, savings and skills you build now will hold you up for years."],
		5: ["a year of change", "Expect movement: a trip, a move or a surprise change of plan that turns out well."],
		6: ["a year of home and heart", "Family, home and responsibility take centre stage, and love grows through care."],
		7: ["a year of reflection", "A quieter year for study, rest and inner work; the answers come when you slow down."],
		8: ["a year of achievement", "Effort turns into results, so ask for what you are worth and expect to be taken seriously."],
		9: ["a year of completion", "Finish, forgive and clear some space; something ends so that something better can arrive."] };
	var PTAIL = { Fire: ["Your fire likes this, as long as you pace yourself.", "Bring your courage, and keep a little patience in your pocket.", "Lead with enthusiasm and let others help carry it."],
		Earth: ["Your earthy patience is exactly what this asks for.", "Keep a simple plan and adjust it each season.", "Trust slow progress; it is still progress."],
		Air: ["Talk it through: the right conversation unlocks the rest.", "Your ideas are the spark, and a calendar makes them real.", "Stay curious, and write the good ideas down."],
		Water: ["Let your intuition choose the timing.", "Protect your energy and the rest will follow.", "Feelings are your compass this year, so trust them."] };
	var LIFEPATH = { 1: "The independent leader: you are here to start things and stand on your own feet.", 2: "The peacemaker: you are here to bring people together and to listen deeply.",
		3: "The creative communicator: you are here to express yourself and lift people's spirits.", 4: "The builder: you are here to create order, security and work that lasts.",
		5: "The adventurer: you are here to experience change, freedom and as much of the world as you can.", 6: "The nurturer: you are here to care, to heal and to make a home for others.",
		7: "The seeker: you are here to study, question and find the truth beneath appearances.", 8: "The powerhouse: you are here to master the material world and to use influence well.",
		9: "The humanitarian: you are here to give, to forgive and to see the bigger picture.",
		11: "Master number 11, the intuitive messenger: a sensitive 2 with an extra charge of inspiration and insight.",
		22: "Master number 22, the master builder: a 4 with the vision to turn big dreams into real structures.",
		33: "Master number 33, the master teacher: a 6 whose care reaches far beyond the family." };
	var FEB29 = { title: "The Leap-Day Original",
		summary: ["Born on the rarest birthday of all, you celebrate properly only once every four years, and you are used to explaining it.",
			"Leap-day people often feel slightly outside ordinary time: a little younger than their age, a little older than their friends.",
			"Pisces imagination meets a Cancer-flavoured decan here, so you mix dreaminess with a strong instinct to look after people.",
			"Day number 2 adds tact and sensitivity: you read moods quickly and do your best work beside someone you trust."],
		str: ["Unforgettable", "Imaginative", "Adaptable", "Reads people well"], chal: ["Feeling different from everyone else", "Weak boundaries", "Putting yourself last"],
		love: "In love you are romantic and loyal, and a partner who makes a fuss of your birthday in the off years wins your heart for good. You notice the small changes in the people you love.",
		work: "You do well in creative, caring and unusual work, where being one of a kind is an advantage. Teamwork multiplies your income more than solo sprints do.",
		motto: "Rare by nature, kind by choice.", advice: "Celebrate on the 28th, the 1st, or both: you have earned the extra cake.", colour: "lagoon blue, with silver" };

	function pick(arr, n) { return arr[((n % arr.length) + arr.length) % arr.length]; }
	function digitSum(n) { n = Math.abs(n); var s = 0; while (n > 0) { s += n % 10; n = Math.floor(n / 10); } return s; }
	function reduce9(n) { n = Math.abs(n); while (n > 9) n = digitSum(n); return n; }
	function reduceKeep(n) { n = Math.abs(n); while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = digitSum(n); return n; }
	function signOfDoy(n) { var best = null; SIGNS.forEach(function (s) { var off = (n - s.start + 366) % 366; if (off < s.len && (!best || off < best.off)) best = { s: s, off: off }; }); return best; }
	function signOf(mo, d) { return signOfDoy(doy(mo, d)).s; }
	function decanOf(mo, d) {
		var so = signOfDoy(doy(mo, d)), s = so.s, k = Math.min(2, Math.floor(so.off * 3 / s.len));
		var a = Math.ceil(k * s.len / 3), b = Math.ceil((k + 1) * s.len / 3) - 1, fa = fromDoy(((s.start + a - 1) % 366) + 1), fb = fromDoy(((s.start + b - 1) % 366) + 1);
		return { sign: s, n: k + 1, pos: so.off, co: SIGNS[(s.i + 4 * k) % 12], dates: MONTHS[fa.mo - 1].slice(0, 3) + " " + fa.d + " – " + MONTHS[fb.mo - 1].slice(0, 3) + " " + fb.d };
	}
	function cuspOf(mo, d) {
		var so = signOfDoy(doy(mo, d)), s = so.s;
		if (so.off <= 2) return { other: SIGNS[(s.i + 11) % 12], text: CUSP[s.i], when: "the first days of " + s.name };
		if (so.off >= s.len - 3) return { other: SIGNS[(s.i + 1) % 12], text: CUSP[(s.i + 1) % 12], when: "the last days of " + s.name };
		return null;
	}
	function titleOf(mo, d) {
		if (mo === 2 && d === 29) return FEB29.title;
		var dc = decanOf(mo, d), row = DEC[dc.sign.name][dc.n - 1], dn = reduce9(d), k = Math.floor((d - 1) / 9);
		var noun = pick(row[0], d + dc.n), t = "The " + ADJ[dn][k] + " " + noun;
		if ((d + mo) % 3 === 0) t += " " + pick(row[1], d + mo);
		return t;
	}
	function birthdayYear(mo, d, today) {   // the year of the most recent birthday on or before today
		var y = today.y, dd = mo === 2 && d === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1 ? 28 : d;
		return today.mo < mo || (today.mo === mo && today.d < dd) ? y - 1 : y;
	}
	function todayParts() { var n = new Date(); return { y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate() }; }
	function yearAhead(mo, d, yr, element) {
		var py = reduce9(mo + d + digitSum(yr)) || 9, p = PYEAR[py];
		return { year: yr, number: py, theme: p[0], text: "From your " + yr + " birthday to your " + (yr + 1) + " one: " + p[0] + ". " + p[1] + " " + pick(PTAIL[element], yr + d) };
	}
	function uniq(list, more) { var out = []; list.concat(more || []).forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); }); return out; }
	// a day near day-of-year n that falls in sign index want (steps outwards from n)
	function matchNear(n, want) {
		for (var k = 0; k < 40; k++) { var a = fromDoy((((n + (k % 2 ? -1 : 1) * Math.ceil(k / 2)) - 1) % 366 + 366) % 366 + 1); if (signOf(a.mo, a.d).i === want) return a; }
		return fromDoy(((n - 1) % 366 + 366) % 366 + 1);
	}

	// profile(month, day[, year of the birthday to forecast from]) -- everything is deterministic in its inputs
	function profile(mo, d, forecastYear) {
		mo = +mo; d = +d;
		if (!valid(mo, d)) return null;
		var dc = decanOf(mo, d), s = dc.sign, row = DEC[s.name][dc.n - 1], tx = TXT[s.name], dn = reduce9(d), nb = NUM[dn], k = Math.floor((d - 1) / 9), n = doy(mo, d);
		var cusp = cuspOf(mo, d), co = TXT[dc.co.name], yr = forecastYear || birthdayYear(mo, d, todayParts()), leap = mo === 2 && d === 29;
		var p = { mo: mo, d: d, date: MONTHS[mo - 1] + " " + d, title: titleOf(mo, d),
			sign: { name: s.name, glyph: s.glyph, dates: s.dates, i: s.i }, element: s.element, modality: s.modality, ruler: s.ruler,
			decan: { n: dc.n, co: dc.co.name, dates: dc.dates, text: dc.n === 1 ? "First decan of " + s.name + " (pure " + s.name + ")" : (dc.n === 2 ? "Second" : "Third") + " decan of " + s.name + ", co-ruled by " + dc.co.name },
			cusp: cusp ? { with: cusp.other.name, text: cusp.text, when: cusp.when } : null,
			dayNumber: reduceKeep(d), birthDayNumber: dn, numberName: nb.name };
		if (leap) {
			p.summary = FEB29.summary.join(" "); p.strengths = FEB29.str.slice(); p.challenges = FEB29.chal.slice(); p.love = FEB29.love; p.work = FEB29.work;
			p.motto = FEB29.motto; p.advice = FEB29.advice; p.luckyColour = FEB29.colour;
		} else {
			var sum = [pick(tx.open, d + dc.n), pick(row[2], d), pick(nb.sum, k)];
			if (cusp) sum.push(cusp.text);
			p.summary = sum.join(" ");
			var si = n % 6, st = uniq([tx.str[si], tx.str[(si + 3) % 6], row[5]], []);
			var coS = dc.n === 1 ? tx.str[(si + 1) % 6] : pick(co.str, n + 2);
			st = uniq(st, [coS, pick(nb.str, k), pick(nb.str, k + 1), tx.str[(si + 2) % 6]]).slice(0, 4);
			p.strengths = st;
			var ci = n % 5; p.challenges = uniq([tx.chal[ci], tx.chal[(ci + 2) % 5], pick(nb.chal, k)], [pick(nb.chal, k + 1), tx.chal[(ci + 4) % 5]]).slice(0, 3);
			p.love = pick(tx.love, n) + " " + pick(nb.love, k + d);
			p.work = pick(tx.work, n + 1) + " " + pick(nb.work, k + d);
			var mi = (n + dc.n) % 3; p.motto = mi < 2 ? row[4][mi] : DAYMOTTO[dn][k];
			p.advice = (n % 5) < 3 ? tx.adv[n % 3] : pick(nb.adv, n);
			var acc = NUM_COLOUR[dn]; p.luckyColour = row[3].indexOf(acc) >= 0 || acc.indexOf(row[3]) >= 0 ? row[3] : row[3] + ", with " + acc;
		}
		p.luckyColour = p.luckyColour.charAt(0).toUpperCase() + p.luckyColour.slice(1);
		p.luckyDay = s.weekday;
		p.luckyNumbers = uniq([dn, d, (n * 7) % 44 + 1, (mo * 5 + d * 3) % 49 + 1, s.i + 10, dn + 18]).slice(0, 4).sort(function (a, b) { return a - b; });
		p.yearAhead = yearAhead(mo, d, yr, s.element);
		p.matches = [[124, 4, "Same element (" + s.element + "): you understand each other without trying."], [-124, 8, "Same element (" + s.element + "): an easy, natural rhythm."],
			[181, 6, "Your opposite sign: different strengths that balance yours."]].map(function (x) {
			var t = matchNear(n + x[0], (s.i + x[1]) % 12); return { mo: t.mo, d: t.d, date: MONTHS[t.mo - 1] + " " + t.d, title: titleOf(t.mo, t.d), sign: SIGNS[(s.i + x[1]) % 12].name, why: x[2] };
		});
		p.forFun = "For fun only: a playful character sketch, not a prediction and not science.";
		return p;
	}
	// Lunar New Year 1900-2100 (China, UTC+8), one letter per year = days after 21 January (A = Jan 21). Computed as the new moon falling on
	// 21 Jan - 20 Feb (Astronomy Engine, via the zodiac page's lib), then corrected for the years that rule gets wrong (1916, 1920, 1985).
	// Approximate outside that check: verify against an almanac before relying on a date right at the turn of a year.
	var LNY = "K^SI[OEXMBUJ]QFYOCVLASH[PDXMCUJ\\QFYODVK^SGZPEXMBUI\\QGYNDWK]SHZPEXMATJ\\QGZNCVK]RH[PEXMATI\\QGZOCUK^RH[PDWLBTI]RFYNCUK^SH[PEWLBUI\\QFXNCVK^SHZODWLBUJ\\QFYMCVL^SHZODWMATI\\PFYNCVK^RGZPDWMBTI\\QFYNDUJ]RGZPEWLAT";
	var LNY_FIX = { 1916: 13, 1920: 30, 1985: 30 };
	var ANIMALS = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"], CN_EL = ["Wood", "Fire", "Earth", "Metal", "Water"];
	function lunarNewYear(y) {
		if (y < 1900 || y > 2100) return null;
		var off = LNY_FIX[y] !== undefined ? LNY_FIX[y] : LNY.charCodeAt(y - 1900) - 65, t = new Date(Date.UTC(y, 0, 21 + off));
		return { y: y, mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
	}
	function chinese(y, mo, d) {
		var ny = lunarNewYear(y), cy = y;
		if (ny && (mo < ny.mo || (mo === ny.mo && d < ny.d))) cy = y - 1;
		var a = ((cy - 4) % 12 + 12) % 12, st = ((cy - 4) % 10 + 10) % 10;
		return { year: cy, animal: ANIMALS[a], element: CN_EL[Math.floor(st / 2)], yin: st % 2 === 1, approximate: !ny, newYear: ny };
	}
	function lifePath(y, mo, d) {
		var a = reduceKeep(mo), b = reduceKeep(d), c = reduceKeep(digitSum(y)), n = reduceKeep(a + b + c);
		return { n: n, master: n === 11 || n === 22 || n === 33, steps: "month " + mo + " → " + a + ", day " + d + " → " + b + ", year " + y + " → " + c + "; " + a + " + " + b + " + " + c + " = " + (a + b + c) + (a + b + c !== n ? " → " + n : ""), text: LIFEPATH[n] };
	}
	// yearProfile(y, m, d[, today {y, mo, d}]) = profile + life path, Chinese zodiac, age, and the forecast for the current birthday year
	function yearProfile(y, mo, d, today) {
		y = +y; mo = +mo; d = +d;
		if (!(y >= 1 && y <= 9999) || !valid(mo, d) || (mo === 2 && d === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1)) return null;
		today = today || todayParts();
		var by = birthdayYear(mo, d, today), p = profile(mo, d, by);
		p.y = y; p.age = by - y; p.lifePath = lifePath(y, mo, d); p.chinese = chinese(y, mo, d);
		return p;
	}
	var ALL = null;
	function all() {
		if (ALL) return ALL;
		ALL = [];
		for (var n = 1; n <= 366; n++) { var t = fromDoy(n); ALL.push({ mo: t.mo, d: t.d, title: titleOf(t.mo, t.d), sign: signOf(t.mo, t.d).name, element: signOf(t.mo, t.d).element }); }
		return ALL;
	}
	function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
	function search(q, n) {
		var w = norm(q).split(" ").filter(Boolean); if (!w.length) return [];
		return all().filter(function (e) { var t = " " + norm(e.title + " " + e.sign + " " + MONTHS[e.mo - 1]); return w.every(function (x) { return t.indexOf(" " + x) >= 0; }); }).slice(0, n || 40);
	}
	// short two-sentence summary for the compact cards on /birthday and /zodiac
	function short(mo, d) {
		var p = profile(mo, d, 2000); if (!p) return null;
		var s = p.summary.match(/[^.!?]+[.!?]+/g) || [p.summary];
		return { title: p.title, text: (s[0].trim() + " " + (s[1] || "").trim()).trim(), sign: p.sign.name, url: "/birthday-personality?m=" + mo + "&d=" + d };
	}
	var BP = { MONTHS: MONTHS, SIGNS: SIGNS, doy: doy, fromDoy: fromDoy, daysIn: daysIn, valid: valid, signOf: signOf, decanOf: decanOf, cuspOf: cuspOf, titleOf: titleOf,
		profile: profile, yearProfile: yearProfile, lifePath: lifePath, chinese: chinese, lunarNewYear: lunarNewYear, reduce9: reduce9, reduceKeep: reduceKeep,
		birthdayYear: birthdayYear, all: all, search: search, short: short, norm: norm };
	if (typeof module !== "undefined" && module.exports) module.exports = BP; else root.BP = BP;
})(typeof window !== "undefined" ? window : globalThis);
