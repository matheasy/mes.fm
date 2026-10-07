// Content for mes.fm/911 and its section pages. Hand-maintained; read by build.mjs.
//
// mes.fm/911 used to mirror the Hive post @mes/911 (one long page of collapsible chapters, plus hand-kept
// Posts and Videos card grids). It is now a tile hub like mes.fm/hutchison and mes.fm/math, and each
// chapter lives on its own page (see PAGES in build.mjs). This file is the source of truth for those
// sections -- the Hive post is no longer fetched. Add new things at the TOP of the right section (newest
// first) and run `npm run build`.
//
// Two kinds of item (same as mes.fm/hutchison/sections.mjs):
//   { title, image, links: [[label, href], ...] }   everything spelled out; the card goes to the first mes.fm
//                                                   link, else the Hive/peakd link, else the first link
//   { href, title }                                 a mes.fm mirror page: thumbnail + "Watch on:" row are
//                                                   scraped at build time and cached in link-meta.json
// `standalone` (per section) = reference links shown as one line above the Grid/List buttons.

export const SECTIONS = [
  {
    id: "911-spooks",
    title: "Spooks",
    items: [
      { href: "https://mes.fm/911-revisionist-slander-mes", title: "9/11 Revisionist Slanders MES" },
      { href: "https://mes.fm/energy-vampire", title: "Disinfo Agents Literally Are Energy Vampires 😂😅😳" },
      { href: "https://mes.fm/offguardian-911-spooks", title: "Another 9/11 Spook Outs Themselves: The OffGuardian X Account" },
      { href: "https://mes.fm/911-spammer-dust-baggie", title: "9/11 Revisionist Spammin' Dust Baggie Nonsense" },
      { href: "https://mes.fm/911-spook-ryan-banister", title: "9/11 Spooky Drama: Ryan Banister Wildin'" },
      { href: "https://mes.fm/hughes-911-spammer-ryan-spooks", title: "9/11 Brings Out the Spooks: David Hughes, 9/11 Revisionist, Ryan Bannister" },
      { href: "https://mes.fm/bg-notes", title: "Bob Greenyer's Claims About Dr. Judy Wood & 9/11" },
      { href: "https://mes.fm/norman-patricia-ai-email", title: "9/11 Jersey Girl Patricia Casazza's Bizarre AI Generated Email to MES" },
      { href: "https://mes.fm/911-revisionist-spammer", title: "9/11 Revisionist = 9/11 Spammer" },
      { href: "https://mes.fm/911revisited-blocks-mes", title: "Norman aka 9/11 Revisited Blocked MES on X" },
      { href: "https://mes.fm/andrew-mason-clown", title: "New 9/11 Disinfo Spook Dropped: Andrew Mason" },
    ],
  },
  {
    id: "911-posts",
    title: "Posts",
    items: [
      { href: "https://mes.fm/amaterasu-solar-judy-wood-quote", title: "Amaterasu Solar Bought a Dr. Judy Wood Quote Coffee Mug" },
      { href: "https://mes.fm/youtube-removed-curt-weldon-911", title: "YouTube Removed My Curt Weldon 9/11 Video for \"Hate Speech\" (Appeal Rejected)" },
      { href: "https://mes.fm/alleged-hijackers-id-911", title: "Alleged Hijackers' Alleged ID on all Four 9/11 sites" },
      { href: "https://mes.fm/drjudywood-total-disclosure-podcast", title: "Dr. Judy Wood on the Total Disclosure Podcast" },
      { href: "https://mes.fm/osama-911-plans-parody", title: "BREAKING: CIA Unseals Osama Bin Laden's Writing Pad with His 9/11 Plans" },
      { href: "https://mes.fm/peter-baron-ufo-ai-testimony", title: "MES Talks to Peter Baron About His UFO 9/11 Sighting" },
      { href: "https://mes.fm/melissa-doi-voices-bleeped", title: "Melissa Doi and the 1,613 Emergency 9/11 Calls" },
      { href: "https://mes.fm/911-3d-print-pin", title: "Niece Made MES a 9/11 Pin with Her 3D Printing Pen" },
      { href: "https://mes.fm/911-hiroshima-fumes", title: "Photo of Hiroshima One Day After the Atomic Bomb Shows Similar Fuming as 9/11" },
      { href: "https://mes.fm/judy-wood-john-wells-live", title: "Dr. Judy Wood Live on the John B. Wells – Caravan to Midnight Show" },
      { href: "https://mes.fm/chris-hampton-big-idea", title: "THE Chris Hampton Comments on the 9/11 Alchemy – A Big Idea Documentary" },
      { href: "https://mes.fm/911-mystery-plane-photos", title: "Rare Photos of a Mystery White Plane Before the South Tower Hit" },
      { href: "https://mes.fm/matthew-naus-g-edward-griffin-wdtttg-book", title: "Matthew Naus Gave G. Edward Griffin the WDTTTG Book in 2012" },
      { href: "https://mes.fm/kj-french-911-100k", title: "French 9/11 Researcher KJ Hits 100k Views in 24 Hours" },
      { href: "https://mes.fm/bought-911-hutchison-shirt", title: "Someone bought a 9/11 DJW Book shirt and Hutchison Effect shirt" },
      { href: "https://mes.fm/csis-911-lights", title: "CSIS Posts a Photo of the 9/11 Tribute in Light \"Blue Beam\" Lights" },
      { href: "https://mes.fm/cat-wdttg-book", title: "Story Time with Cat and Dr. Judy Wood's WDTTG Book" },
    ],
  },
  {
    id: "911-videos",
    title: "Videos",
    items: [
      { href: "https://mes.fm/911-dustification-vs-demolition", title: "North Tower Quiet Dustification vs Bethlehem Steel HQ Loud Demolition" },
      { href: "https://mes.fm/curt-weldon-911-dew-muted", title: "YouTube Reinstated My Curt Weldon Video After Muting the \"Hate Speech\" Part 🤐▶️" },
      { href: "https://mes.fm/curt-weldon-firefighters-911-dustification", title: "Former Congressman Curt Weldon & Firefighters testimony: Towers turned to dust on 9/11" },
      { href: "https://mes.fm/911-naudet-first-plane", title: "Jules Naudet Footage of the First \"Plane\" on 9/11 + Slow / Fast Motion Analysis" },
      { href: "https://mes.fm/bernie-kerik-911-jumpers-evaporated", title: "NYPD Commissioner Bernie Kerik says 9/11 Jumpers \"Evaporated\" and most of bodies disintegrated" },
      { href: "https://mes.fm/saudi-911-calculations", title: "Saudi Arabia \"Intelligence Asset\" Showed 9/11 \"Hijackers\" Hand-Drawn Plane Calculations" },
      { href: "https://mes.fm/peter-baron-ufo-911", title: "Peter Baron's UFO Sighting on 9/11" },
      { href: "https://mes.fm/whats-it-toasted-car", title: "Dr. Judy Wood Explains Toasted Cars on 9/11 and the “What’s It” Car" },
      { href: "https://mes.fm/livestream-140-trailer-911-real-avengers", title: "Trailer for MES Livestream 140: 9/11 – The Real Avengers by Chris Shak" },
      { href: "https://mes.fm/livestream-140-trailer-dust-plumes-911", title: "Trailer for MES Livestream 140: Massive Dust Plumes on 9/11" },
      { href: "https://mes.fm/nasa-911-fumes-hurricane-erin", title: "NASA Astronaut Frank Culbertson Jr. Saw WTC Fumes on 9/11 but Didn’t Mention Hurricane Erin" },
      { href: "https://mes.fm/curt-weldon-pbd-podcast-dew", title: "Patrick Bet David Asks Former Congressman Curt Weldon About Dr. Judy Wood and Hurricane Erin" },
      { href: "https://mes.fm/curt-weldon-jimmy-dore-dew", title: "Former Congressman Curt Weldon Brings Up Dr. Judy Wood and Directed Energy on the Jimmy Dore Show" },
      { href: "https://mes.fm/911-coat-jumper", title: "Alleged Launched Person Is Actually a Coat and NOT a 9/11 Jumper" },
      { href: "https://mes.fm/richard-gage-flat-earth", title: "Mr. Richard Gage Doesn't Know if the Earth Is Round or Flat" },
      { href: "https://mes.fm/eric-larson-lies", title: "Author Eric Larson Speaks About Our Current Culture and Nation of Lies" },
      { href: "https://mes.fm/jerry-leaphart-dew", title: "Attorney Jerry Leaphart on NIST Hiring Military Contractors that Specialize in DEW and PsyOps" },
      { href: "https://mes.fm/one-armed-twin", title: "Occult Connections: The One-Armed Twin in Star Wars, 9/11, and The Matrix" },
      { href: "https://mes.fm/ashton-forbes-letter", title: "Highlights from the Letter that Ashton Forbes Totally Didn't Write to Himself" },
      { href: "https://mes.fm/stanley-praimnath-jumpers", title: "9/11 Survivor Stanley Praimnath says the jumpers and paper were sucked out from the windows" },
      { href: "https://mes.fm/911-jumper-launched", title: "Rare Footage of 9/11 Jumper appears to be Launched Laterally with Great Force from the North Tower" },
    ],
  },
  {
    id: "911-truth",
    title: "9/11 Truth Video Series",
    standalone: [
      {"href": "https://mes.fm/911truth-playlist", "title": "YouTube Playlist"},
    ],
    items: [
      { title: "Part 37: Energetic Dust and Fumes on 9/11",
        image: "https://images.3speak.tv/images/1789102535632-e7393ad37d773059.webp",
        links: [["Notes", "https://mes.fm/911-cold-dust-fumes"], ["3Speak", "https://3speak.tv/watch?v=mes/911truth-part-37-energetic-202"], ["YouTube (Censored)", "https://youtu.be/4vnIN0tU9QA"], ["Telegram", "https://t.me/meslinks/35489"], ["BitChute", "https://www.bitchute.com/video/ZdNJ4sV9HQAO/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-37-Energetic-Dust-Fumes-911:d"], ["Rumble", "https://rumble.com/v7fd0nc-911truth-part-37-energetic-dust-and-fumes-on-911.html"]] },
      { title: "Part 36: Dr. Judy 2007 Lecture - 9/11: The New Hiroshima",
        image: "https://files.peakd.com/file/peakd-hive/mes/23uQpChP87UBDVxUZE4MMciBZCvQEY78XbVyRRq8v8DFMui6FztsjbjhaY2xf3tSvgNMb.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/rnzwduvq"], ["3Speak", "https://3speak.tv/watch?v=mes/rnzwduvq"], ["YouTube", "https://youtu.be/O0i5mES0MZA"], ["BitChute", "https://www.bitchute.com/video/qyYxDOfpHUHr"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-36-Judy-Wood-Madison-2007:7"], ["Rumble", "https://rumble.com/v6zcawq-911truth-part-36-dr.-judy-wood-2007-lecture-911-the-new-hiroshima.html"], ["Summary", "https://inleo.io/threads/view/mes/re-leothreads-2qvgbsuki"]] },
      { title: "Part 35: Exterior Lobby Columns at Ground Level on 9/11",
        image: "https://files.peakd.com/file/peakd-hive/mes/23xp8m8KkiUNqPiQ6YZ15qdT717MibNf3x4cJmPztUCCXeTNdhnNyTMa4jsi4KrgPZzQm.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/qftnfdqq"], ["3Speak", "https://3speak.tv/watch?v=mes/qftnfdqq"], ["YouTube", "https://youtu.be/baYFiYDoIQ8"], ["BitChute", "https://old.bitchute.com/video/kq0NsxgO8l8K/"], ["Odysee", "https://odysee.com/911Truth-35-Exterior-Lobby-Columns-911:25bca782043858e0cd3f438ed44fdfdadc4ba4a8"], ["Rumble", "https://rumble.com/v6v4g6x-911truth-part-35-exterior-lobby-columns-at-ground-level-on-911.html"]] },
      { title: "Part 34: Electromagnetic Interference during 2nd Impact on 9/11",
        image: "https://files.peakd.com/file/peakd-hive/mes/23wMhCCGezGZkzb1XxMD8gkHqvHPctxbaLZaVrLynYkRA2pD3STQHbLjGDoPVYfxJQgMk.JPEG",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/tpcoktor"], ["3Speak", "https://3speak.tv/watch?v=mes/tpcoktor"], ["YouTube", "https://youtu.be/5WnjoqIQOt4"], ["BitChute", "https://bitchute.com/video/Hb48wWKRBuwA/"], ["Odysee", "https://odysee.com/911Truth-34-EMF-2nd-Impact-911:b6a06a3175fca18562ad4fe1b861bc157346162b"], ["Rumble", "https://rumble.com/v6e6y0g-911truth-part-34-electromagnetic-interference-during-2nd-impact-on-911.html"]] },
      { title: "Part 33: Electromagnetic Field Interference on 9/11",
        image: "https://files.peakd.com/file/peakd-hive/mes/24244XqiweEFHBsrHxS9Y7pu4M9Fq3VTuypqMNFHE3uEUeLmPH7y9mbmMZNAzaG2TJFZ3.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/grpqbovi"], ["3Speak", "https://3speak.tv/watch?v=mes/grpqbovi"], ["YouTube", "https://youtu.be/FuN-MIyIpv4"], ["BitChute", "https://bitchute.com/video/MqhNUFHGD6F3/"], ["Odysee", "https://odysee.com/@mes:8/911truth-EMF-Interference:7"], ["Rumble", "https://rumble.com/v6a8dvs-911truth-part-33-electromagnetic-field-interference-on-911.html"]] },
      { title: "Part 32: 3D Volumetric Image Projection on 9/11 (Clip from Censored Documentary)",
        image: "https://files.peakd.com/file/peakd-hive/mes/23xAeRgDZYXQeNfZp7h8icZcw8R9etrRWtrRBkiSdmhkCTez9tHe4Rba2f57XbW3p3ctm.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/kqogyjjx"], ["3Speak", "https://3speak.tv/watch?v=mes/kqogyjjx"], ["YouTube", "https://youtu.be/aUoVE7ky3qY"], ["BitChute", "https://bitchute.com/video/EDt0wuB9B061/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-32-Volumetric-Projection:7"], ["Rumble", "https://rumble.com/v5emgh1-911truth-part-32-3d-volumetric-image-projection-on-911-clip-from-censored-d.html"]] },
      { title: "Part 31: Feature Documentary: 9/11 Alchemy - A Big Idea by Wolf Clan Media",
        image: "https://files.peakd.com/file/peakd-hive/mes/23vsUxyXRa3cvPbnmTaJZitjmVqTW7kP3Psoy7gDgrzquKfkqTWBoXv357u24CuoMPN3F.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/vgouudww"], ["3Speak", "https://3speak.tv/watch?v=mes/vgouudww"], ["YouTube New", "https://youtu.be/yV-atFC14lw"], ["BitChute", "https://bitchute.com/video/HviA2gzBCwHo/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-31-911-Alchemy-Big-Idea:c"], ["Rumble", "https://rumble.com/v5ehwdv-911truth-part-31-feature-documentary-911-alchemy-a-big-idea-by-wolf-clan-me.html"]] },
      { title: "Part 30: Right Wing Disappears at Exact Same Time and Place in 9 Videos",
        image: "https://files.peakd.com/file/peakd-hive/mes/23wCJKEwSiyju8ihK2tEB43JZB7zFcSjPyky7CQQw8i8VAVFhmD3zi1vzzkys3Qxwa8of.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/zmprrlkh"], ["3Speak", "https://3speak.tv/watch?v=mes/zmprrlkh"], ["YouTube", "https://youtu.be/lCxWLzjr0FM"], ["BitChute", "https://bitchute.com/video/uCi4PRWjYH4S/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-30-Right-Wing-Disappears:b"], ["Rumble", "https://rumble.com/v5blj6j-911truth-part-30-right-wing-disappears-at-exact-same-time-and-place-in-9-vi.html"]] },
      { title: "Part 29: Compilation of Disappearing Wings and other 9/11 Plane Anomalies",
        image: "https://files.peakd.com/file/peakd-hive/mes/23wMaKAmR2jhyAytsz1PfDvcnJiFZ3vzQnhNF9WLtF8t2UukAv5p5uawzYWk4aGhznauX.jpeg",
        links: [["Notes", "https://mes.fm/911truth-29-compilation-planes-wing-anomalies"], ["3Speak", "https://3speak.tv/watch?v=mes/zormfuii"], ["YouTube", "https://youtu.be/ilwlQpXUvVA"], ["BitChute", "https://www.bitchute.com/video/pZfvZ2x7ZXPa/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-29-Disappearing-Wings-911-Plane-Anomalies:d"], ["Rumble", "https://rumble.com/v58awjf-911truth-part-29-compilation-of-disappearing-wings-and-other-911-plane-anom.html"]] },
      { title: "Part 28: Compilation of Twisted Steel on 9/11",
        image: "https://files.peakd.com/file/peakd-hive/mes/23tH3rn3j8yy2DbBgakApQ8VNmUd1812Q9DDK9P98334hgJDD9UMw62kAEHUCvw223bG9.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/ndloyfuv"], ["3Speak", "https://3speak.tv/watch?v=mes/ndloyfuv"], ["YouTube", "https://youtu.be/9U4IWTu9rHk"], ["BitChute", "https://www.bitchute.com/video/24d0E4dV5an7/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-28-Compilation-of-Twisted-Steel-on-911:1"], ["Rumble", "https://rumble.com/v46pnxx-911truth-part-28-compilation-of-twisted-steel-on-911.html"]] },
      { title: "Part 27: Compilation of North Tower 900 ft Spire Turning to Dust",
        image: "https://files.peakd.com/file/peakd-hive/mes/243WPSXqZZEyfngaga9edr4fgMPXnf1s5c1Bb8JYyqWVTm6kSuUSDH8ERTiHQWXFhsKxg.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/gaqombxg"], ["3Speak", "https://3speak.tv/watch?v=mes/gaqombxg"], ["YouTube", "https://youtu.be/sX-1wz1V5gE"], ["BitChute", "https://www.bitchute.com/video/khPqjCS6DLAU/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-27-Compilation-of-North-Tower-Spire-Turning-to-Dust:d"], ["Rumble", "https://rumble.com/v444jkk-911truth-part-27-compilation-of-north-tower-900-ft-spire-turning-to-dust.html"]] },
      { title: "Part 26: 9/11 WTC Vehicle Massacre by xdesmond",
        image: "https://files.peakd.com/file/peakd-hive/mes/23vi1fCPuSF3GsXirdhWFm5Q8nwTyXRfxYhnWMBFtdLnv8XUeCpwpNcN2xTZr8193CLnk.jpeg",
        links: [["Hive", "https://mes.fm/911-wtc-vehicle-massacre"], ["3Speak", "https://3speak.tv/watch?v=mes/lazaqoat"], ["YouTube", "https://youtu.be/3inx6WvIEsg"], ["BitChute", "https://www.bitchute.com/video/t4kJG5EtuqLz/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-26-911-WTC-Vehicle-Massacre:f"], ["Rumble", "https://rumble.com/v41p4vc-911truth-part-26-911-wtc-vehicle-massacre-by-xdesmond.html"]] },
      { title: "Part 25: Melissa Doi 911 Call from the 83rd Floor of the South Tower",
        image: "https://files.peakd.com/file/peakd-hive/mes/23ynPw98LKduRsdRuxQa3SvLc5Tq33qAAMbT5xRgMvp7zhm9jBPQfHXosVXpa9rqCfGUX.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/911truth-part-25-melissa-doi-911-call-from-the-83rd-floor-of-the-south-tower"], ["3Speak", "https://3speak.tv/watch?v=mes/jwkndsuw"], ["YouTube", "https://youtu.be/3inx6WvIEsg"], ["BitChute", "https://www.bitchute.com/video/9GmGf9E4ghS9/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-25-Melissa-Doi-911-Call-from-the-83rd-Floor-of-the-South-Tower:7"], ["Rumble", "https://rumble.com/v3wrlj5-911truth-part-25-melissa-doi-911-call-from-the-83rd-floor-of-the-south-towe.html"]] },
      { title: "Part 24: LET ME KNOW WHEN YOU SEE FIRE by RealityAXIS",
        image: "https://files.peakd.com/file/peakd-hive/mes/23uFKXoLgu4FkNUM5kFVNRmZLUDgQ13r716LvisvkgK6LEcc1JMtmaX5rHeEXNkqhy47X.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/911truth-part-24-let-me-know-when-you-see-fire"], ["3Speak", "https://3speak.tv/watch?v=mes/tldgxkdq"], ["YouTube", "https://youtu.be/E1a_-rqmQl4"], ["BitChute", "https://www.bitchute.com/video/z2o3dnWUDftN/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-24-LET-ME-KNOW-WHEN-YOU-SEE-FIRE:6"], ["Rumble", "https://rumble.com/v3mihpg-911truth-part-24-let-me-know-when-you-see-fire-by-realityaxis.html"]] },
      { title: "Part 23: North Tower Core Columns Spire Literally Turning to Dust",
        image: "https://files.peakd.com/file/peakd-hive/mes/23zknZAeQutzQbA7wUyau5QNdqbJkG33PZhGCBYTHTZMi3En994mpaLtPvQP9MrwHLcrv.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/911truth-part-23-spire-turning-to-dust"], ["3Speak", "https://3speak.tv/watch?v=mes/tngeozdq"], ["YouTube", "https://youtu.be/wJazsgxeuFc"], ["BitChute", "https://www.bitchute.com/video/S5SQbDtPgwCy/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-23-Spire-Literally-Turning-to-Dust:c"], ["Rumble", "https://rumble.com/v3h019s-911truth-part-23-north-tower-core-columns-spire-literally-turning-to-dust.html"]] },
      { title: "Part 22: Feature Documentary: Observable Evidence",
        image: "https://files.peakd.com/file/peakd-hive/mes/243qMMtWHzPhpsPDE26eHj6gVGU3r51TyBwkGmR9XjmudjPckzbV77ibe9Ns9iYpSRJ9G.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/jbeotgzz"], ["3Speak", "https://3speak.tv/watch?v=mes/jbeotgzz"], ["YouTube", "https://youtu.be/8Xw-00NbEE8"], ["BitChute", "https://www.bitchute.com/video/W1GZ6PWc5aCk/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-22-Observable-Evidence:0"], ["Rumble", "https://rumble.com/v1q7pxa-911truth-part-22-feature-documentary-observable-evidence.html"], ["Video sections playlist", "https://www.youtube.com/playlist?list=PLai3U8-WIK0G_HHWt33moIqEeUBP3cgCh"]] },
      { title: "Part 21: Feature Documentary: 9/11 Liars for Truth",
        image: "https://files.peakd.com/file/peakd-hive/mes/23xL1186xMdy5kvGaGQggtZCfFPQNzqqbanpZQQpe8XWVM1nYcFeXdzLk4Mq2YDqtzKYJ.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/yaiugjff"], ["3Speak", "https://3speak.tv/watch?v=mes/yaiugjff"], ["YouTube", "https://youtu.be/7xAyB0b3FL4"], ["BitChute", "https://www.bitchute.com/video/qIFWVuEWp71b/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-21-Liars-for-Truth:6"], ["Rumble", "https://rumble.com/v1q79cc-911truth-part-21-feature-documentary-911-liars-for-truth.html"]] },
      { title: "Part 20: Feature Trailer: 9/11 The Essential Guide",
        image: "https://files.peakd.com/file/peakd-hive/mes/23u5zbMzKjS1vABzH2JV2gtLNeY2cVEuVoR5iRWjJR5bposfobKEkr5HDCqJDz9q7eovQ.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/kuopqqhz"], ["3Speak", "https://3speak.tv/watch?v=mes/kuopqqhz"], ["YouTube", "https://youtu.be/zn2rd_jEJkU"], ["BitChute", "https://www.bitchute.com/video/pVwiHI0xH03K/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-20-Essential-Guide:1"], ["Rumble", "https://rumble.com/v1q6zyk-911truth-part-20-feature-trailer-911-the-essential-guide.html"]] },
      { title: "Part 19: Feature Series: IRREFUTABLE: Free-Energy Technology Revealed to the World",
        image: "https://files.peakd.com/file/peakd-hive/mes/23tby6qp55FNg7JGPYLzmXrsQHoBSf5P9vMiE2aUjfCQZxp64UaFmhRUEcxYVw81nLUq1.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/911truth-part-19-irrefutable-classified-free-energy-technology-revealed-to-the-world"], ["3Speak", "https://3speak.tv/watch?v=mes/ezpdeggm"], ["YouTube", "https://youtu.be/s7HPhlX0TH8"], ["BitChute", "https://www.bitchute.com/video/BfgX89sL0kw7/"], ["Odysee", "https://odysee.com/@mes:8/%E2%9C%88%EF%B8%8F-911truth-part-19-feature-series:9"]] },
      { title: "Part 18: Feature Documentary: 9/11 Alchemy - Free Energy & Free Thinking by WCM",
        image: "https://files.peakd.com/file/peakd-hive/mes/cx6JdXYb-911Truth20Part20182091120Alchemy20Free20Energy.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/911truth-part-18-9-11-alchemy-free-energy-and-free-thinking-by-wcm"], ["3Speak", "https://3speak.tv/watch?v=mes/pptgowdb"], ["YouTube", "https://youtu.be/Otq1ZdGrPPQ"], ["BitChute", "https://www.bitchute.com/video/GcAFLJqegRXD/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-18-feature-documentary-9:9"], ["Rumble", "https://rumble.com/v1rc8po-911truth-part-18-feature-documentary-911-alchemy-free-energy-and-free-think.html"]] },
      { title: "Part 17: Dustification of the World Trade Center Complex (Fast Forward 45X Speed)",
        image: "https://files.peakd.com/file/peakd-hive/mes/KDvo87vv-911Truth20Part201720Dustification20of20WTC20Fast20Forward.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/911truth-part-17-dustification-of-the-wtc-fast-forward"], ["3Speak", "https://3speak.tv/watch?v=mes/xyqxzafz"], ["YouTube", "https://youtu.be/1R190c0Tpks"], ["BitChute", "https://www.bitchute.com/video/VK9fMVg2gEo2/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-17-dustification-of-the:2"], ["Rumble", "https://rumble.com/v1rcbpq-911truth-part-17-dustification-of-the-world-trade-center-complex-fast-forwa.html"]] },
      { title: "Part 16: Bill Cooper’s 9/11 Prediction During June 28, 2001 Radio Broadcast",
        image: "https://files.peakd.com/file/peakd-hive/mes/yLx278Ca-911Truth20Part201620Bill20Cooper20Prediction.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/911truth-part-16-bill-cooper-s-9-11-prediction-during-june-28-2001-radio-broadcast"], ["3Speak", "https://3speak.tv/watch?v=mes/oobrwcad"], ["YouTube", "https://youtu.be/qPW_W_z6ovw"], ["BitChute", "https://www.bitchute.com/video/ZivGCATvqchO/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-16-bill-cooper-s-9-11:5"], ["Rumble", "https://rumble.com/v1rc80o-911truth-part-16-bill-coopers-911-prediction-during-june-28-2001-radio-broa.html"]] },
      { title: "Part 15: Feature Presentation: The Dawn of a New Age by Dr. Judy Wood",
        image: "https://files.peakd.com/file/peakd-hive/mes/23u5ZEehFPDvLN2xaCqtYz9H3qjn2eQEWZs28ZPinw1zinMTE6egMGKy9RKVzT1Q96fdG.jpeg",
        links: [["Hive", "https://peakd.com/freeenergy/@mes/911truth-part-15-feature-presentation-the-dawn-of-a-new-age-by-dr-judy-wood"], ["3Speak", "https://3speak.tv/watch?v=mes/ywpqnawp"], ["YouTube", "https://youtu.be/8jC9W2vbyrs"], ["BitChute", "https://www.bitchute.com/video/tSOjcYBLMv0K/"], ["Odysee", "https://odysee.com/@mes:8/-911Truth-Part-15-Dr.-Judy-Wood-2012-BEM-Presentation:5"], ["Rumble", "https://rumble.com/v1wxhdi-911truth-part-15-feature-presentation-the-dawn-of-a-new-age-by-dr.-judy-woo.html"]] },
      { title: "French Translation: Le 11 Septembre : La Boîte de Pandore de l'Énergie Libre ~ Judy Wood",
        image: "https://i.ytimg.com/vi/owOvrnO4j_4/maxresdefault.jpg",
        links: [["YouTube", "https://youtu.be/owOvrnO4j_4"]] },
      { title: "Part 14: Building 7 Turning to Dust for Over 7 Hours (Fast Forward 45X Speed)",
        image: "https://cdn.steemitimages.com/DQmcmFDY2ZSxhiYLhQFPSBCma1E1hqB1hiaTF5BWrbC6H1b/#911Truth%20Part%2014%20WTC%207%20Fast%20Forward.jpeg",
        links: [["Hive", "https://peakd.com/history/@mes/911truth-part-14-building-7-turning-to-dust-for-over-7-hours-fast-forward-45x-speed"], ["3Speak", "https://3speak.tv/watch?v=mes/umttzpox"], ["YouTube", "https://youtu.be/YCtfQJAepfU"], ["BitChute", "https://www.bitchute.com/video/B1AEZlW7vCWq/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-14-building-7-turning-to:3"], ["Rumble", "https://rumble.com/v1wx7wa-911truth-part-14-building-7-turning-to-dust-for-over-7-hours-fast-forward-4.html"]] },
      { title: "Part 13: Helicopter Footage of the Twin Towers Turning to Dust (Fast Forward 45X Speed)",
        image: "https://cdn.steemitimages.com/DQmeREUDRftakgE5BGUyzyNnb8DBqAWnCbFk3Jo8GHJhsrs/#911Truth%20Part%2013%20Chopper%20WTC%201%20and%202%20Fast%20Forward.jpeg",
        links: [["Hive", "https://peakd.com/history/@mes/911truth-part-13-helicopter-footage-of-the-twin-towers-turning-to-dust-fast-forward-45x-speed"], ["3Speak", "https://3speak.tv/watch?v=mes/xrxdhtzu"], ["YouTube", "https://youtu.be/NBvevof2eI0"], ["BitChute", "https://www.bitchute.com/video/OluSL67cj2G7/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-13-helicopter-footage-of:2"], ["Rumble", "https://rumble.com/v1ybb62-911truth-part-13-helicopter-footage-of-the-twin-towers-turning-to-dust-fast.html"]] },
      { title: "Part 12: Gen. Wesley Clark Reveals Middle East Invasion Was Pre-Planned & Iran is NEXT",
        image: "https://cdn.steemitimages.com/DQmXHy3h4rPzhZkyfbBs42PzagPAjoTNSfVK5DZJv3PsYFK/#911Truth%20Part%2012%20General%20Wesley%20Clark%207%20Countries%205%20Years.jpeg",
        links: [["Hive", "https://peakd.com/war/@mes/911truth-part-12-gen-wesley-clark-reveals-middle-east-invasion-was-pre-planned-and-iran-is-next"], ["3Speak", "https://3speak.tv/watch?v=mes/hhxxoawq"], ["YouTube", "https://youtu.be/WGkSNAHqpJM"], ["BitChute", "https://www.bitchute.com/video/lPAnbESJmoUT/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-12-gen-wesley-clark:a"], ["Rumble", "https://rumble.com/v21x1tq-911truth-part-12-gen.-wesley-clark-reveals-middle-east-invasion-was-pre-pla.html"]] },
      { title: "Part 11: Feature Documentary: 9/11 Alchemy – Facing Reality by Wolf Clan Media",
        image: "https://cdn.steemitimages.com/DQmQ9zi1NtAqMYWQ29pn4eVCPxfvthv8zoxySpcx2hHMLNv/#911Truth%20Part%2011%20911%20Alchemy%20Documentary.jpeg",
        links: [["Hive", "https://peakd.com/terrorism/@mes/911truth-part-11-feature-documentary-9-11-alchemy-facing-reality-by-wolf-clan-media"], ["3Speak", "https://3speak.tv/watch?v=mes/tcqyprkc"], ["YouTube", "https://youtu.be/CrzNeZUp0tU"], ["YouTube has removed it after being up for 4 years", "https://peakd.com/hive-113182/@mes/youtube-removes-my-911truth-part-11-upload-for-hate-speech"], ["YouTube has censored this video by placing it in a \"Limited State\"", "https://peakd.com/censorship/@mes/orwellian-youtube-censors-my-9-11-video-after-it-went-viral-911truth-censorship"], ["BitChute", "https://www.bitchute.com/video/iu7zQw4sSYkv/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-11-Feature-Documentary-911-Alchemy:6"], ["Rumble", "https://rumble.com/v21x70e-911truth-part-11-feature-documentary-911-alchemy-facing-reality-by-wolf-cla.html"], ["French Translation", "https://inleo.io/threads/view/mes/re-leothreads-2yrwzxhal"]] },
      { title: "French Translation: L'alchimie du 11 Septembre ~ Arme à énergie dirigée & projection holographique",
        image: "https://files.peakd.com/file/peakd-hive/mes/23wX5EUcsQh7ztqR2Qjarmcq7s421qgDDZNQDzGPJoaxZ6hv4SuABV4h8AEcCiNsGgAuY.png",
        links: [["YouTube", "https://youtu.be/vMxSQkMWEEY"], ["Telegram", "https://t.me/meslinks/29223"]] },
      { title: "Part 10: War Criminal George Bush Jokes about WMDs while Pure Evil ‘Journalists’ Laugh",
        image: "https://cdn.steemitimages.com/DQmXbGEFtgPnFn1F1MpEjc97Nz7DzPGmC6CLp7TYYGVAGc6/#911Truth%20Part%2010%20Bush%20and%20'Journalists'%20Joke%20of%20WMDs.jpeg",
        links: [["Hive", "https://peakd.com/war/@mes/911truth-part-10-war-criminal-george-bush-jokes-about-wmds-while-pure-evil-journalists-laugh"], ["3Speak", "https://3speak.tv/watch?v=mes/lzwouafl"], ["YouTube", "https://youtu.be/yWD6pGQCwM8"], ["BitChute", "https://www.bitchute.com/video/yWD6pGQCwM8/"], ["Odysee", "https://odysee.com/911truth-part-10-war-criminal-george"]] },
      { title: "Part 9: North & South Towers Literally Turning to Dust (Fast Forward 45X Speed)",
        image: "https://files.peakd.com/file/peakd-hive/mes/242NuzfdM7niLudiLjTZbMavzDth8UmnMtNbR27358JsjN7hU8AK7Y6DhCato461frgui.jpeg",
        links: [["Hive", "https://peakd.com/terrorism/@mes/911truth-part-9-north-and-south-towers-literally-turning-to-dust-fast-forward-45x-speed"], ["3Speak", "https://3speak.tv/watch?v=mes/mjodwjpp"], ["YouTube", "https://youtu.be/W1xFXj-6pVs"], ["BitChute", "https://www.bitchute.com/video/qg6AN6fYyMZq/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-9-north-south-towers:0"]] },
      { title: "Part 8: North Tower Literally Turning to Dust (Fast Forward 45X Speed)",
        image: "https://files.peakd.com/file/peakd-hive/mes/23z7JHh7kt2t66BEkKbCjb31HQBoCPbFZmj3C2ppw1vom5ryjQH2HstxdSt4DjXvC9DqS.jpeg",
        links: [["Hive", "https://peakd.com/terrorism/@mes/911truth-part-8-north-tower-literally-turning-to-dust-fast-forward-45x-speed"], ["3Speak", "https://3speak.tv/watch?v=mes/igrvinih"], ["YouTube", "https://youtu.be/cDoWaaXv27A"], ["BitChute", "https://www.bitchute.com/video/cDoWaaXv27A/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-8-north-tower-literally:5"]] },
      { title: "Part 7: How Controlled Opposition Works: Alex Jones, Cali DEW Fires, Flat Earth + MORE",
        image: "https://files.peakd.com/file/peakd-hive/mes/23z7MyCnQ1b2HcapHeFNXZ8CPfqNDQah23KoKzyEAHr1HwD75avvmip4nYVGDRiB8S9QA.jpg",
        links: [["Hive", "https://peakd.com/terrorism/@mes/911truth-part-7-how-controlled-opposition-works-alex-jones-cali-dew-fires-flat-earth-more"], ["3Speak", "https://3speak.tv/watch?v=mes/tfrronmw"], ["YouTube has removed it after being up for 5 years", "https://peakd.com/hive-113182/@mes/youtube-removes-my-911truth-part-7-video-for-hate-speech"], ["BitChute", "https://www.bitchute.com/video/PiEOS2TJLLQ/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-7-how-controlled:8"], ["Rumble", "https://rumble.com/v278wbu-911truth-part-7-how-controlled-opposition-works-alex-jones-cali-dew-fires-f.html"]] },
      { title: "Part 6: Controlled Opposition: 'Mini Nukes', 'Building 7', AE911Truth Hoax",
        image: "https://cdn.steemitimages.com/DQmNR7ZdLMfoEeq6hfGxsPQ6nQQj3f7R2PBB3psv3fRb7tR/#911Truth%20Part%206%20Controlled%20Opposition.jpeg",
        links: [["Hive", "https://peakd.com/conspiracy/@mes/911truth-part-6-controlled-opposition-mini-nukes-building-7-ae911truth-hoax"], ["3Speak", "https://3speak.tv/watch?v=mes/qlsuekos"], ["YouTube", "https://youtu.be/aDWgsVSo4Oc"], ["BitChute", "https://www.bitchute.com/video/aDWgsVSo4Oc/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-6-Controlled-Opposition:b"]] },
      { title: "Part 5: 9/11 Ushered in the Global World Government #NWO Charlottesville NorthKorea",
        image: "https://files.peakd.com/file/peakd-hive/mes/242DLp3A2BR2bFU6hwgd5FyVdYuzLMyPLkTH4mhpoLjuy5cQ32orHzrzpow2aPhYCrsxq.jpeg",
        links: [["Hive", "https://peakd.com/nwo/@mes/911truth-part-5-9-11-ushered-in-the-global-world-government-nwo-charlottesville-northkorea"], ["3Speak", "https://3speak.tv/watch?v=mes/hquwicgs"], ["YouTube", "https://youtu.be/2p7XwWdXYz8"], ["BitChute", "https://www.bitchute.com/video/HSJ6G9ArRW94/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-5-9-11-ushered-in-the:3"]] },
      { title: "Part 4: Dr. Judy Wood Litmus Test + Bill Cooper's Death + MORE",
        image: "https://cdn.steemitimages.com/DQmXR7mmGcwpS7FmxqEA1GkKSBhV1wBfTgFzYQ42P7i7Y2e/#911Truth%20Part%204%20Bill%20Cooper's%20Death.jpeg",
        links: [["Hive", "https://peakd.com/@mes/video-notes-911truth-part-4-dr-judy-wood-litmus-test-bill-cooper-s-death-more"], ["3Speak", "https://3speak.tv/watch?v=mes/dkwemjfm"], ["YouTube", "https://youtu.be/OkkN8oFzZt8"], ["BitChute", "https://www.bitchute.com/video/X7Ni5AYvniki/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-4-dr-judy-wood-litmus-test:7"]] },
      { title: "Part 3: I Got Banned from Reddit’s r/911Truth So I Created r/911TruthMES #Censorship",
        image: "https://cdn.steemitimages.com/DQmVWRe7sV5gJoLV9zwCPHkhSbUQ3QVdffLefeDuKHBmTXS/#911Truth%20Part%203%20Reddit%20911TruthMES.jpeg",
        links: [["Hive", "https://peakd.com/censorship/@mes/video-notes-911truth-part-3-i-got-banned-from-reddit-s-r-911truth-so-i-created-r-911truthmes-censorship"], ["3Speak", "https://3speak.tv/watch?v=mes/hpbevmoo"], ["YouTube", "https://youtu.be/5gbs3IPz63M"], ["BitChute", "https://www.bitchute.com/video/FNddHqXxcXSo/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-3-i-got-banned-from-reddit:8"]] },
      { title: "Part 2: Official Government Narrative + Demonetization + Concern Trolling",
        image: "https://files.peakd.com/file/peakd-hive/mes/23xybj69AhAz66MRimrmwRAgsan3bhkPaHRLPyAudN8pRAtTxQhLGXk19CApvJ2MMxfku.jpeg",
        links: [["Hive", "https://peakd.com/terrorism/@mes/video-notes-911truth-part-2-official-government-narrative-demonetization-concern-trolling"], ["3Speak", "https://3speak.tv/watch?v=mes/vrchefzt"], ["YouTube removed it after it was up for 4 years", "https://peakd.com/hive-113182/@mes/deja-vu2-youtube-removes-my-911truth-part-2-video"], ["BitChute", "https://www.bitchute.com/video/cMTcGcds26CE/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-2-official-government:c"], ["PDF notes", "https://1drv.ms/b/s!As32ynv0LoaIhvYi87uB4ds7NQWhgA"]] },
      { title: "Part 1: Introduction, Dr. Judy Wood, & #FreeEnergy",
        image: "https://files.peakd.com/file/peakd-hive/mes/242NsZPMbWcNd8kNZtxvYAu8WhaRVb3ULWtxQ82DLB8b7PHq87jEZhbnr7vs6VPTFhv1J.jpeg",
        links: [["Hive", "https://peakd.com/@mes/video-notes-911truth-part-1-introduction-dr-judy-wood-and-freeenergy"], ["3Speak", "https://3speak.tv/watch?v=mes/jiefczlj"], ["YouTube", "https://youtu.be/lBB2yClPlLM"], ["BitChute", "https://www.bitchute.com/video/4wWRQ6DZZQPH/"], ["Odysee", "https://odysee.com/@mes:8/911truth-part-1-introduction-dr-judy:6"]] },
    ],
  },
  {
    id: "911-observable-evidence",
    title: "9/11 Observable Evidence",
    standalone: [
      {"href": "https://www.youtube.com/playlist?list=PLai3U8-WIK0G_HHWt33moIqEeUBP3cgCh", "title": "Playlist"},
      {"href": "https://peakd.com/hive-113182/@mes/jbeotgzz", "title": "Notes", "icon": "&#128221;"},
    ],
    items: [
      { title: "Part 22: Feature Documentary: Observable Evidence",
        image: "https://files.peakd.com/file/peakd-hive/mes/243qMMtWHzPhpsPDE26eHj6gVGU3r51TyBwkGmR9XjmudjPckzbV77ibe9Ns9iYpSRJ9G.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/jbeotgzz"], ["3Speak", "https://3speak.tv/watch?v=mes/jbeotgzz"], ["YouTube", "https://youtu.be/8Xw-00NbEE8"], ["BitChute", "https://www.bitchute.com/video/W1GZ6PWc5aCk/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-22-Observable-Evidence:0"], ["Rumble", "https://rumble.com/v1q7pxa-911truth-part-22-feature-documentary-observable-evidence.html"]] },
      { title: "9/11 Observable Evidence: Background Information",
        image: "https://files.peakd.com/file/peakd-hive/mes/23zRzmRdrSsrKoTeabMJmhG5GcfE96GkMssqfsEN3dLM93Wy3kx5coNqwDgis7zdtHvs1.jpeg",
        links: [["YouTube", "https://youtu.be/sFgHaBNPNL4"]] },
      { title: "9/11 Observable Evidence: The Scientific Method",
        image: "https://files.peakd.com/file/peakd-hive/mes/23x12U3Ry8E8v3BzS1pYaZfxuoQgaKWYv5GbxF96URHnXj5hPWw9i8tRf7WWZNEAeMbRp.jpeg",
        links: [["YouTube", "https://youtu.be/6FnuKGTfbfk"]] },
      { title: "9/11 Observable Evidence: Why Do We Still Have a Coverup?",
        image: "https://files.peakd.com/file/peakd-hive/mes/242DUktCeUcRf1hVeDZK253JUcCgf5uxis38qmEJLC4cT3QW454FBxJj6k7djLHhUxnQK.jpeg",
        links: [["YouTube", "https://youtu.be/oHbUBbfipNw"]] },
      { title: "9/11 Was an Attack on Human Consciousness",
        image: "https://files.peakd.com/file/peakd-hive/mes/23vrryjhWC4v9SN73c9FV7RdBYZdrdmNrWjH8LUfWhWhPEy1uMZgohqS1jB3vn85rArcf.jpeg",
        links: [["YouTube", "https://youtu.be/5rH_108evQ0"]] },
      { title: "Fox News Anchor Solved 9/11 in 43 seconds!",
        image: "https://files.peakd.com/file/peakd-hive/mes/241tdRp5N1mb6AV7LXvPE1kvDpdsh1uFB5hJwarjNswWYpUcj2nrjbRM9u8QExpVQCcjB.jpeg",
        links: [["YouTube", "https://youtu.be/6Pr23QI75js"]] },
      { title: "9/11 Observable Evidence: Stairwell B Survivors",
        image: "https://files.peakd.com/file/peakd-hive/mes/2423qFWLLJmmMC1hKqszAxwh7bQdt1rZqxhdABT4m8JDCqeDAjDaBkhHfKT63cRLWr1oa.jpeg",
        links: [["YouTube", "https://youtu.be/_V3f1mB70Ys"]] },
      { title: "9/11 Survivors Mickey Kross & Pasquale Buzzelli are in Disbelief the North Tower Vanished Above Them",
        image: "https://files.peakd.com/file/peakd-hive/mes/23y8mWQVYbLo7gPshLG7Tyz1tcceF36BNyr6x2XiKVhx7Vzj5psG3n475EgVekepXk4qn.jpeg",
        links: [["YouTube", "https://youtu.be/1t0ZU3EVdQs"]] },
      { title: "9/11 Observable Evidence: Where did the South Tower Go?",
        image: "https://files.peakd.com/file/peakd-hive/mes/244A4YAs8MvUHJNB5DBPkkGJhvdzEKDAx3B2BPKLJ8pdrp9jdpzAfYedmESqCXHzgfrZK.jpeg",
        links: [["YouTube", "https://youtu.be/bKH4PAlv9GE"]] },
      { title: "9/11 Observable Evidence: We Are Leaving Our Thinking to Someone Else",
        image: "https://files.peakd.com/file/peakd-hive/mes/23xVEn9Dx1wYowKXMkBjP1jbFoNu9925QX4Q7nrKgRFScnNnLeznYSB2x9DGm2g9thYs2.jpeg",
        links: [["YouTube", "https://youtu.be/fZCJIFwNV-0"]] },
      { title: "9/11 Observable Evidence: Fraudulent NIST Report on the \"Collapse\" of the Twin Towers",
        image: "https://files.peakd.com/file/peakd-hive/mes/23uR9R3gog1Rt48LB1HacjC6heyEmNgSpHTvX86Q8gtjL4UnMy8dJiQYdtU6fMPnYWAEQ.jpeg",
        links: [["YouTube", "https://youtu.be/sdADDsGtfis"]] },
      { title: "Part 20: Feature Trailer: 9/11 The Essential Guide",
        image: "https://files.peakd.com/file/peakd-hive/mes/23u5zbMzKjS1vABzH2JV2gtLNeY2cVEuVoR5iRWjJR5bposfobKEkr5HDCqJDz9q7eovQ.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/kuopqqhz"], ["3Speak", "https://3speak.tv/watch?v=mes/kuopqqhz"], ["YouTube", "https://youtu.be/zn2rd_jEJkU"], ["BitChute", "https://www.bitchute.com/video/pVwiHI0xH03K/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-20-Essential-Guide:1"], ["Rumble", "https://rumble.com/v1q6zyk-911truth-part-20-feature-trailer-911-the-essential-guide.html"]] },
      { title: "Part 21: Feature Documentary: 9/11 Liars for Truth",
        image: "https://files.peakd.com/file/peakd-hive/mes/23xL1186xMdy5kvGaGQggtZCfFPQNzqqbanpZQQpe8XWVM1nYcFeXdzLk4Mq2YDqtzKYJ.jpeg",
        links: [["Hive", "https://peakd.com/hive-113182/@mes/yaiugjff"], ["3Speak", "https://3speak.tv/watch?v=mes/yaiugjff"], ["YouTube", "https://youtu.be/7xAyB0b3FL4"], ["BitChute", "https://www.bitchute.com/video/qIFWVuEWp71b/"], ["Odysee", "https://odysee.com/@mes:8/911Truth-Part-21-Liars-for-Truth:6"], ["Rumble", "https://rumble.com/v1q79cc-911truth-part-21-feature-documentary-911-liars-for-truth.html"]] },
    ],
  },
  {
    id: "911-short-videos",
    title: "9/11 Truth Short Videos",
    items: [
      { title: "Building 7: The TRUTH Cut by 9/11 Revisionist",
        image: "https://files.peakd.com/file/peakd-hive/mes/23xp2ZQqEQjFBSakzGRWnWSKRhECNBQdJJ21rWsrbMSFQ7EmKLAUn73vAponspCLsjra9.jpeg",
        links: [["YouTube", "https://youtu.be/QH6Q230711E"]] },
      { title: "Building 7: The TRUTH Cut 2.0 by 9/11 Revisionist",
        image: "https://files.peakd.com/file/peakd-hive/mes/23xySzXtA3i4197aqAEmkBECQ2ZK8fSdyiUdmJSwnsikMN4ZZm1hzYV7eWY9TyvqNYBCR.jpeg",
        links: [["YouTube", "https://youtu.be/o3mr0Y6QrN0"]] },
      { title: "9/11 20th+ Anniversary Verse by Check The Evidence",
        image: "https://files.peakd.com/file/peakd-hive/mes/23y8sUUfFXSJtH5jmwyz3desuqBd2xXLsjRTmuLQhcaDXseh7RYxqGytHFmEsCk15HJuC.jpeg",
        links: [["YouTube", "https://youtu.be/Bcrw0gVENoQ"]] },
      { title: "\"But None of His Clothes Were Burned\" - Stephen Newman Saves 9/11 Burn Victim Kenneth Summers",
        image: "https://files.peakd.com/file/peakd-hive/mes/23wgPhonjQApyzWLsTMmaNfki6Jugco5o2jaqoJCe3YWFKDQd51fAneBGQSFgf4szBeke.jpeg",
        links: [["YouTube", "https://youtu.be/c6zN0-FH7ks"]] },
      { title: "EPIC Edit by 9/11 Revisionist: Where Did The Towers Go? (Corrected Version)",
        image: "https://files.peakd.com/file/peakd-hive/mes/23wX1dh3TcxPuob3S6QRM1xhXiDzPgaQeagGjFWv8MV3ZnqVUMAQZKzqayqLgv97xmhPA.jpeg",
        links: [["YouTube", "https://youtu.be/EIUNza56F6E"]] },
      { title: "Mystery Flashes on 9/11",
        image: "https://files.peakd.com/file/peakd-hive/mes/245mte6BhasrBuMnx7CyxzRRYvUcHTqvSjCbj3iLh7DLJHxii3RD4EESjZ3wrdDWi9gDK.jpeg",
        links: [["YouTube", "https://youtu.be/3XDBPpOxcZ8"]] },
      { title: "9/11 North Tower Spire Dustification by Trevor Evans. Featuring Dr. Judy Wood",
        image: "https://files.peakd.com/file/peakd-hive/mes/23yd6EYLAQSvHp5EpTqRU3gq7GASRQu5WAdbgzL9XDXf7pEQeiTbkqrZiRvRAwydm7357.jpeg",
        links: [["YouTube", "https://youtu.be/ivj_9TUvlCE"]] },
      { title: "9/11 Dustification vs Alka-Seltzer Tablets (Slow Motion)",
        image: "https://files.peakd.com/file/peakd-hive/mes/23wCLK5eeGab4r3GPKRpsMkeERDbUtdYMH54pX5X4zGKMJPzp4YKdrAMMAyc3jyQzbFvh.jpeg",
        links: [["YouTube", "https://youtu.be/xMSxNUqaWko"]] },
      { title: "3D Printed Models of the WTC and LiDAR Data",
        image: "https://files.peakd.com/file/peakd-hive/mes/242NzP9vDrBhm9VQTAY9s61RvduYDD2d8cV19t2znjSfDdLwvcUzwu8NT3FUattQ2BKW8.jpeg",
        links: [["YouTube", "https://youtu.be/0PmLqdDPK6Y"]] },
    ],
  },
  {
    id: "1109-keo-meteor-music",
    title: "1109 by Keor Meteor Music Album",
    standalone: [
      {"href": "https://www.youtube.com/playlist?list=PLai3U8-WIK0FUd8p-bzqCVSDd6gOcHcDr", "title": "Playlist"},
      {"href": "https://keormeteor1.bandcamp.com/album/1109", "title": "Album (Bandcamp)", "icon": "&#127925;"},
    ],
    items: [
      { title: "1109 by Keor Meteor: Intro",
        image: "https://files.peakd.com/file/peakd-hive/mes/244A8vfVzd2wbPx6NwHLQDbGQdW1ZTqgTFjvFVd1QzV1RFyoNrNyBj8nCDqMGXWbFJrrt.jpg",
        links: [["YouTube", "https://youtu.be/hQlPItudSSQ"], ["Telegram", "https://t.me/meslinks/22706"]] },
      { title: "1109 by Keor Meteor: 1109",
        image: "https://files.peakd.com/file/peakd-hive/mes/23y8zPY47q8XekoqM1J9i4FfhvLwLxW74zpunPT7vYLAe7M5oDjzMxi4ab3sLhWdct3vp.jpg",
        links: [["YouTube", "https://youtu.be/yzuI-O2mhok"], ["Telegram", "https://t.me/meslinks/22864"]] },
      { title: "1109 by Keor Meteor: Liberty Street",
        image: "https://files.peakd.com/file/peakd-hive/mes/23uQg7f37MrF37TxVKjVN9pEpmXD9eHPsvtdE6Yrx3A4idRYXdzKy5Cmmg39w6vz22kGo.jpg",
        links: [["YouTube", "https://youtu.be/F3sgbzG2Fgs"], ["Telegram", "https://t.me/meslinks/23071"]] },
      { title: "1109 by Keor Meteor: Melted Vehicles",
        image: "https://files.peakd.com/file/peakd-hive/mes/23wWyBz1LGtKoy4dMWReYqkE3PkbZK4unjsXJUkHXZPGPPAtdX4v2bLuK8X56LouqUjpX.jpg",
        links: [["YouTube", "https://youtu.be/jhgpcI1xhrc"], ["Telegram", "https://t.me/meslinks/23195"]] },
      { title: "1109 by Keor Meteor: George Comedy Club",
        image: "https://files.peakd.com/file/peakd-hive/mes/243fvqWcw8wj3FvBWsm4jbWnou7HkAGRB9eG8rYN61jo2aFAr6g2xznofyyA7Xh5YGkGj.jpg",
        links: [["YouTube", "https://youtu.be/gajxilO2BNw"], ["Telegram", "https://t.me/meslinks/23320"]] },
      { title: "1109 by Keor Meteor: Osama",
        image: "https://files.peakd.com/file/peakd-hive/mes/244eP8AMstJVjt7W1NF9q7WczQhoPXmJ7bzwnzEpGoxcq7AiWZmuH7sabcRamWBeShPd3.jpg",
        links: [["YouTube", "https://youtu.be/kbQblhUUQzY"], ["Telegram", "https://t.me/meslinks/23416"]] },
      { title: "1109 by Keor Meteor: Falling Down",
        image: "https://files.peakd.com/file/peakd-hive/mes/23xpCriKHjCov6gjqoMNcgod4Kae21HrERT6nEZXiKg7uUtL3a8kwS6c3DyGWGMrd72Nq.jpg",
        links: [["YouTube", "https://youtu.be/P4gc7b67eH0"], ["Telegram", "https://t.me/meslinks/23477"]] },
    ],
  },
];

// Rendered under the hub tiles as "Important Links" (the old page's Important Links chapter + its "More MES 9/11 Links" list).
export const IMPORTANT_LINKS_HTML = `<h3>Links to All Notes and Playlists</h3>
<p><a href="https://mes.fm/911truth-onedrive">MES OneDrive files</a> - <a href="https://odysee.com/$/playlist/a4981c9731bec068847fd370b593769304b0b181">Odysee playlist</a> - <a href="https://mes.fm/911truth-bitchute">BitChute playlist</a> - <a href="https://mes.fm/911truth-playlist">YouTube playlist</a> (Parts 2, 7, and 31 deleted by YT) - <a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0G_HHWt33moIqEeUBP3cgCh">9/11 Observable Evidence playlist</a></p>
<h3>Key Links</h3>
<p><a href="https://mes.fm/judywoodbook">&quot;Where Did the Towers Go?&quot; by Dr. Judy Wood</a> - <a href="https://www.facebook.com/groups/911TruthMovement">9/11 Forensic Evidence Facebook Group</a> - <a href="https://www.reddit.com/r/911TruthMES">Reddit r/911TruthMES</a> - <a href="https://peakd.com/c/hive-113182">MES 9/11 Truth Hive community</a> - <a href="https://peakd.com/hive-113182/@mes/499-first-responders-witness-testimonies-911-8pz">499 First Responders Witness Testimonies</a></p>
<h3>Links to X Threads</h3>
<ul>
<li><a href="https://x.com/MathEasySolns/status/1807634322394103895">Very little heat on 9/11</a></li>
<li><a href="https://x.com/MathEasySolns/status/1774679023370834358">Building 7 falling quietly</a></li>
<li><a href="https://x.com/MathEasySolns/status/1770320084650864746">WTC literally turning to dust</a></li>
<li><a href="https://x.com/MathEasySolns/status/1760368820315988275">Twisted steel</a></li>
<li><a href="https://x.com/MathEasySolns/status/1756373125422526612">Toasted cars</a></li>
<li><a href="https://x.com/MathEasySolns/status/1752373887814521142">Hutchison Effect</a><ul>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0GlfVj5AYNtbF688pr8fk9X">Hutchison Effect playlist</a></li>
</ul>
</li>
</ul>
<h3>More MES Series</h3>
<p><a href="https://peakd.com/experiments/@mes/list">MES Experiments</a> - <a href="https://mes.fm/experiments-draft">DRAFT Experiments</a> - <a href="https://peakd.com/antigravity/@mes/series">Anti-Gravity</a> - <a href="https://mes.fm/science-playlist">MES Science</a> - <a href="https://mes.fm/freeenergy-playlist">Free Energy</a> - <a href="https://peakd.com/truth/@mes/911">9/11 Truth</a> - <a href="http://mes.fm/occult-playlist">Occult</a> - <a href="https://peakd.com/pg/@mes/videos">PizzaGate</a> - <a href="https://www.youtube.com/@mes/streams">MES Livestreams</a> - <a href="https://mes.fm/911">https://mes.fm/911</a></p>
<h3>More MES 9/11 Links</h3>
<ul>
<li><a href="https://mes.fm/911-alchemy">9/11 Alchemy by Wolf Clan Media</a></li>
<li><a href="https://peakd.com/c/hive-113182">HIVE Community</a></li>
<li><a href="https://www.reddit.com/r/911TruthMES/">Reddit r/911TruthMES</a></li>
<li><a href="https://peakd.com/truth/@mes/911">HIVE Links and Notes</a></li>
<li>9/11 Truth files: <a href="https://mes.fm/911truth-onedrive">mes.fm/911truth-onedrive</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0EzqTamtIXtgX8QudQSxuxh">YouTube Playlist</a></li>
<li style="margin-left: 20px;"><a href="https://mes.fm/911truth-playlist">mes.fm/911truth-playlist</a></li>
<li style="margin-left: 20px;"><a href="https://peakd.com/hive-113182/@mes/deja-vu2-youtube-removes-my-911truth-part-2-video">YouTube removes Part 2</a></li>
<li style="margin-left: 20px;"><a href="https://peakd.com/hive-113182/@mes/youtube-removes-my-911truth-part-7-video-for-hate-speech">YouTube removes Part 7</a></li>
<li style="margin-left: 20px;"><a href="https://t.me/meslinks/19514">YouTube removed Part 11 for 7 months</a></li>
<li><a href="https://www.bitchute.com/playlist/MSsLsRJrMPJt/">BitChute Playlist</a></li>
<li style="margin-left: 20px;"><a href="https://mes.fm/911truth-bitchute">mes.fm/911truth-bitchute</a></li>
<li><a href="https://odysee.com/$/playlist/a4981c9731bec068847fd370b593769304b0b181">Odysee Playlist</a></li>
<li><a href="https://rumble.com/playlists/fkQOVpQ7tZ0">Rumble Playlist</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0G_HHWt33moIqEeUBP3cgCh">9/11 Observable Evidence YouTube Playlist</a></li>
<li style="margin-left: 20px;">This is an 11 hour documentary made by <a href="https://www.checktheevidence.com/wordpress/2021/12/27/9-11-liars-for-truth-what-happened-on-9-11-and-how-it-was-covered-up/">anonymous authors</a> which I am dubbing over with my voice.</li>
<li style="margin-left: 20px;">I also include other video clips in this playlist that don't make it onto my main 9/11 Truth video series.</li>
<li><a href="https://www.wheredidthetowersgo.com/buy/">Where Did The Towers Go? By Dr. Judy Wood</a></li>
<li style="margin-left: 20px;"><a href="https://mes.fm/judywoodbook">mes.fm/judywoodbook</a></li>
<li><a href="https://www.facebook.com/groups/911TruthMovement">9/11 Forensic Evidence Study Group</a></li>
<li><a href="https://peakd.com/hive-113182/@mes/gaqombxg">900ft Spire Turning to Dust</a></li>
<li><a href="https://peakd.com/hive-113182/@mes/lazaqoat">Toasted Cars</a></li>
<li><a href="https://peakd.com/hive-113182/@mes/ndloyfuv">Twisted Steel</a></li>
<li><a href="https://snipboard.io/ulLJIT.jpg">Before and After Photo</a> of the WTC while Building 7 is still standing showing the rubble is mainly ground level.</li>
<li><a href="https://x.com/MathEasySolns/status/1688765811497091072">Richard D. Hall's 9/11 Planes Radar Analysis</a></li>
<li style="margin-left: 20px;"><a href="https://t.me/meslinks/17095">Bunker buster missile vs 2nd plane impact</a></li>
<li style="margin-left: 20px;"><a href="https://www.checktheevidence.com/wordpress/2007/10/02/going-in-search-of-planes-in-nyc/">Andrew Johnson's "planes" witnesses study</a></li>
<li><a href="https://www.youtube.com/@911PlanesResearch">9/11 Planes Researcher</a></li>
<li><a href="https://www.checktheevidence.com/">Check The Evidence</a></li>
<li style="margin-left: 20px;"><a href="https://peakd.com/hive-113182/@mes/andrew-johnsons-911-books-2011-finding-the-truth-and-2017-holding-the-truth">Andrew Johnson's books: 9/11 Finding and Holding the Truth</a></li>
<li>🗣 <a href="https://www.youtube.com/playlist?list=PLdwkvCI5-tzw">Bob Greenyer says the darnedest things</a> 😹</li>
<li style="margin-left: 20px;"><a href="https://mes.fm/bg-wildin">mes.fm/bg-wildin</a></li>
<li><a href="https://t.me/meslinks/23567?comment=25240">Disinfo Agent Ace Baker pushing CGI disinfo and faking his death.</a></li>
<li><a href="https://t.me/meslinks/18941">MES confronting disinfo agent Richard Gage</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0FUd8p-bzqCVSDd6gOcHcDr">1109 music album by Keor Meteor</a></li>
<li>X Threads</li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1807634322394103895">Very little heat on 9/11</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1774679023370834358">Building 7 falling quietly</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1770320084650864746">WTC literally turning to dust</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1760368820315988275">Twisted steel</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1756373125422526612">Toasted cars</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1752373887814521142">Hutchison Effect</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0GlfVj5AYNtbF688pr8fk9X">Hutchison Effect playlist</a></li>
<li><a href="https://rumble.com/playlists/ZZ7ZMxinb6g">Matthew Naus DVD playlist</a></li>
<li><a href="https://mes.fm/911djw">DJW Links</a></li>
</ul>
`;
