// Content for mes.fm/science and its section pages. Hand-maintained; read by build.mjs.
//
// mes.fm/science used to be a flat page with Posts/Videos card grids and a link list. It is now a tile hub
// like mes.fm/911 and mes.fm/hutchison (build.mjs is cloned from 911/build.mjs): one icon tile each for
// Posts, Videos and Tutorials, linking to mes.fm/science-posts, mes.fm/science-videos and mes.fm/science-tutorials (the "MES Science Tutorials" playlist, PLai3U8-WIK0GhjCHmTw1XbqMD_EdVKdd9, newest first). The Videos are the last 14 of the "MES Physics" YouTube playlist
// (PLai3U8-WIK0EAUu0aAxoZmkS83RI65m1N), in playlist order (replaced the five playlist cards, 2026-10-06). Add new things at the
// TOP of the right section (newest first) and run `npm run build`.
//
// Item shapes (same as mes.fm/911/sections.mjs):
//   { href, title }                                 a mes.fm mirror page: thumbnail + excerpt scraped at build
//                                                   time and cached in link-meta.json
//   { title, image, links: [[label, href], ...] }   everything spelled out

export const SECTIONS = [
  {
    id: "science-posts",
    title: "Posts",
    items: [
  { href: "https://mes.fm/telegram-database", title: "Made a Sortable Database of All My Telegram Posts (26,000+ and Counting) 🤯💯" },
  { href: "https://mes.fm/space-shuttle-columbia-disaster-shook-house", title: "Space Shuttle Columbia Disaster Shook a House on Earth" },
  { href: "https://mes.fm/fungi-poop", title: "Fungi Decomposin' Dog Poop 🦠💩👀" },
  { href: "https://mes.fm/america-gov-ai-chat", title: "USA Launches America.gov, an AI Chat Site for Government Services" },
  { href: "https://mes.fm/mendeleev-chemical-table-dream", title: "Dmitri Mendeleev Said He Came Up With the Periodic Table in a Dream" },
  { href: "https://mes.fm/fleischmann-corn-starch", title: "Is Corn Starch the Key to Martin Fleischmann's Cold Fusion Experiments?" },
  { href: "https://mes.fm/ferrocell-specular-reflection", title: "Demystifying the Ferrocell: Specular Reflection" },
    ],
  },
  {
    id: "science-videos",
    title: "Videos",
    standalone: [
      { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EAUu0aAxoZmkS83RI65m1N", title: "MES Science and Physics Videos Playlist" },
    ],
    items: [
  { title: "Amazing 360-degree fog image projection + interactive display! 😮", image: "https://i.ytimg.com/vi/_iwAATk0IOI/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=_iwAATk0IOI"]] },
  { title: "Laser-induced plasma to create 3D volumetric images with sound 🤯", image: "https://i.ytimg.com/vi/r_CrobH0m7g/sddefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=r_CrobH0m7g"]] },
  { title: "Tom Wind discusses the 1985 Fleischmann and Pons cold fusion hole in the floor experiment", image: "https://i.ytimg.com/vi/6lX3uZOqvdI/hqdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=6lX3uZOqvdI"]] },
  { title: "Amazing street performance with Tesla coils and special suits! ⚡⚡⚡⚡", image: "https://i.ytimg.com/vi/41FBcKnpJWA/hqdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=41FBcKnpJWA"]] },
  { title: "Band plays music with Tesla Coil plasma speakers! 🎸🎸⚡⚡", image: "https://i.ytimg.com/vi/sLNuU5ELAGk/hqdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=sLNuU5ELAGk"]] },
  { title: "Rare footage of a tornado appears to form from the ground up! 🌪😮", image: "https://i.ytimg.com/vi/VEwTmPTYrTM/hqdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=VEwTmPTYrTM"]] },
  { title: "Meteorologist Ted Fujita's explanation for how tornadoes are formed 🌪", image: "https://i.ytimg.com/vi/Ge0FcItQDe0/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=Ge0FcItQDe0"]] },
  { title: "Rare extended footage of a tornado being formed in Mexico 2012 🌪", image: "https://i.ytimg.com/vi/50lGlnq3irc/hqdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=50lGlnq3irc"]] },
  { title: "Mini-tornado at the WTC on 9/11 🌪👀", image: "https://i.ytimg.com/vi/L4CGd4A4W70/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=L4CGd4A4W70"]] },
  { title: "Rare extended footage of the ball lightning spotted in Alberta, Canada on July 2, 2025 ⚡💥", image: "https://i.ytimg.com/vi/ZbBmd1KphP8/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=ZbBmd1KphP8"]] },
  { title: "Francis McCabe’s 88X Torque Over-Unity Oscillating Gyro Piston Prototype", image: "https://i.ytimg.com/vi/rJ7ag17LxA8/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=rJ7ag17LxA8"]] },
  { title: "500 mph steel plow splits car in half + Super-slow motion", image: "https://i.ytimg.com/vi/GgAtdqZ-s-A/sddefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=GgAtdqZ-s-A"]] },
  { title: "WARNING: Tesla coil sparks can burst your ear drums when wearing earbuds headphones! ⚠️⚡️", image: "https://i.ytimg.com/vi/0v9ErjS3op4/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=0v9ErjS3op4"]] },
  { title: "Shadow on the Moon can move faster than the speed of light because a shadow is not a physical object", image: "https://i.ytimg.com/vi/ZAvQccbPRH0/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=ZAvQccbPRH0"]] },
    ],
  },
  {
    id: "science-tutorials",
    title: "Tutorials",
    standalone: [
      { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0GhjCHmTw1XbqMD_EdVKdd9", title: "MES Science Tutorials Playlist" },
    ],
    items: [
  { title: "🔥#MESScience 4: Review of COVID-19 \"Virus\" Isolation Paper", image: "https://i.ytimg.com/vi/cvDO85Rw4d8/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=cvDO85Rw4d8"], ["Hive", "https://peakd.com/hive-128780/@mes/messcience-4-review-of-covid-19-virus-isolation-paper"], ["3Speak", "https://3speak.tv/watch?v=mes/nffierng"], ["Rumble", "https://rumble.com/v2s9cdm-messcience-4-review-of-covid-19-virus-isolation-paper.html"], ["Odysee", "https://odysee.com/@mes:8/MESScience-4-Review-of-COVID-19-Virus-Isolation-Paper:a"], ["BitChute", "https://www.bitchute.com/video/UmzzyzSXT0Oi/"]] },
  { title: "🔥#MESScience 3: Overview of Biology", image: "https://i.ytimg.com/vi/WX_qzT0nZFY/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=WX_qzT0nZFY"], ["Hive", "https://peakd.com/hive-128780/@mes/messcience-3-overview-of-biology"], ["Odysee", "https://odysee.com/@mes:8/-MESScience-3-Overview-of-Biology:6"], ["BitChute", "https://www.bitchute.com/video/9mMUelvuj1Ak/"]] },
  { title: "🔥#MESScience 3: Progress and Update", image: "https://i.ytimg.com/vi/9qztFaK8kmQ/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=9qztFaK8kmQ"], ["3Speak", "https://3speak.tv/watch?v=mes/xdiwwamm"], ["Rumble", "https://rumble.com/v1q6vb2-messcience-3-progress-and-update.html"], ["Odysee", "https://odysee.com/@mes:8/%F0%9F%94%A5-messcience-3-progress-and-update:b"], ["BitChute", "https://www.bitchute.com/video/Bc2jwpAThkeL/"]] },
  { title: "🔥#MESScience 2: Vortex Math Part 1: Number Theory and Modular Arithmetic", image: "https://i.ytimg.com/vi/mTeZD8rsiTs/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=mTeZD8rsiTs"], ["Hive", "https://peakd.com/hive-128780/@mes/messcience-2-vortex-math-part-1-number-theory-and-modular-arithmetic"], ["3Speak", "https://3speak.tv/watch?v=mes/hdgxsydk"], ["Rumble", "https://rumble.com/v1tdc7w-messcience-2-vortex-math-part-1-number-theory-and-modular-arithmetic.html"], ["Odysee", "https://odysee.com/@mes:8/-MESScience-2-Vortex-Math-Number-Theory-Modular-Arithmetic:6"], ["BitChute", "https://www.bitchute.com/video/pVz1G50QnQkV/"]] },
  { title: "🔥#MESScience 1: How Does a Powerball Gyroscope Work? + Gyros Are Inverted Pendulums", image: "https://i.ytimg.com/vi/6cRkjWN8Uds/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=6cRkjWN8Uds"], ["Hive", "https://peakd.com/@mes/messcience-1-how-does-a-powerball-gyroscope-work-gyros-are-inverted-pendulums"], ["3Speak", "https://3speak.tv/watch?v=mes/pcsxcbgl"], ["Rumble", "https://rumble.com/v1wwz0w-messcience-1-how-does-a-powerball-gyroscope-work-gyros-are-inverted-pendulu.html"], ["Odysee", "https://odysee.com/@mes:8/-MESScience-1-Gyro-Powerball-Inverted-Pendulum:5"], ["BitChute", "https://www.bitchute.com/video/wMcl9tK3ymr7/"]] },
    ],
  },
  {
    id: "physics",
    title: "Physics",
    standalone: [
      { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EAUu0aAxoZmkS83RI65m1N", title: "MES Physics Videos Playlist" },
    ],
    items: [
  { title: "The Magnetic Field Resembles the Electric Field of 2 Bound Charges", image: "https://i.ytimg.com/vi/0c0k3MgFYcQ/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=0c0k3MgFYcQ"], ["Hive", "https://peakd.com/@mes/atafixln"], ["3Speak", "https://3speak.tv/watch?v=mes/atafixln"], ["Rumble", "https://rumble.com/v4pthjn-the-magnetic-field-resembles-the-electric-field-of-2-bound-charges.html"], ["Odysee", "https://odysee.com/@mes:8/Magnetic-Field-Resembles-Electric-Field:b"], ["BitChute", "https://www.bitchute.com/video/b2ugJ8QxhOo2/"]] },
  { title: "Magnetic Isopotentials Explain the Faraday Paradox, Stern-Gerlach Experiment, and Atomic Orbitals", image: "https://i.ytimg.com/vi/NOG9VOBtpY4/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=NOG9VOBtpY4"], ["Hive", "https://peakd.com/@mes/xdxcqhxk"], ["3Speak", "https://3speak.tv/watch?v=mes/xdxcqhxk"], ["Rumble", "https://rumble.com/v5dwvz1-magnetic-isopotentials-explain-the-faraday-paradox-stern-gerlach-experiment.html"], ["Odysee", "https://odysee.com/@mes:8/Magnetic-Isopotentials:b"], ["BitChute", "https://www.bitchute.com/video/x48F2gLnUWLz/"]] },
  { title: "🔬#MESExperiments 35: Faraday's Paradox using Iron Filings", image: "https://i.ytimg.com/vi/hotOO9bwrrA/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=hotOO9bwrrA"], ["Hive", "https://peakd.com/@mes/jaezbche"], ["3Speak", "https://3speak.tv/watch?v=mes/jaezbche"], ["Rumble", "https://rumble.com/v4nhpz2-mesexperiments-35-faradays-paradox-using-iron-filings.html"], ["Odysee", "https://odysee.com/@mes:8/MESExperiments-35-Faraday-Paradox-Iron-Filings:d"], ["BitChute", "https://www.bitchute.com/video/IYRhwOGUg6mv/"]] },
  { title: "🔬#MESExperiments 36: Faraday's Paradox using Ferrofluid (and Iron Filings)", image: "https://i.ytimg.com/vi/MgsWBi4Jr5E/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=MgsWBi4Jr5E"], ["Hive", "https://peakd.com/@mes/hdmneruh"], ["3Speak", "https://3speak.tv/watch?v=mes/hdmneruh"], ["Rumble", "https://rumble.com/v4p6nt6-mesexperiments-36-faradays-paradox-using-ferrofluid-and-iron-filings.html"], ["Odysee", "https://odysee.com/@mes:8/MESExperiments-36-Faradays-Paradox-Ferrofluid:f"], ["BitChute", "https://www.bitchute.com/video/7tt6j3dpBqPc/"]] },
  { title: "Planck's Constant is the Quantum of Energy and NOT \"Quantum of Action\"", image: "https://i.ytimg.com/vi/W6-FvG8OBAk/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=W6-FvG8OBAk"], ["Rumble", "https://rumble.com/v5ogmtt-plancks-constant-is-the-quantum-of-energy-and-not-quantum-of-action.html"], ["Odysee", "https://odysee.com/@mes:8/Planck-Constant-Quantum-Energy:f"], ["BitChute", "https://www.bitchute.com/video/so3SmTa4yZAp/"]] },
  { title: "🔬#MESExperiments 45: Rotating Cylinders in Water Behave Like Magnets", image: "https://i.ytimg.com/vi/eHZfSHjME90/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=eHZfSHjME90"], ["Hive", "https://peakd.com/@mes/mesexperiments-45-water-magnets-aether"], ["Rumble", "https://rumble.com/v5tk0i8-mesexperiments-45-rotating-cylinders-in-water-behave-like-magnets.html"], ["Odysee", "https://odysee.com/@mes:8/MESExperiments-45-Water-Magnets-Aether:b"], ["BitChute", "https://www.bitchute.com/video/ka9VrfCaoJfH/"]] },
  { title: "🔬#MESExperiments 33: Spinning Tops in Opposing Directions Spin Together", image: "https://i.ytimg.com/vi/fUYl4F6vkg0/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=fUYl4F6vkg0"], ["Hive", "https://peakd.com/@mes/ahxaundg"], ["3Speak", "https://3speak.tv/watch?v=mes/ahxaundg"], ["Rumble", "https://rumble.com/v484b89-mesexperiments-33-spinning-tops-in-opposing-directions-spin-together.html"], ["Odysee", "https://odysee.com/@mes:8/MESExperiments-33-Spinning-Tops-in-Opposing-Directions-Spin-Together:d"], ["BitChute", "https://www.bitchute.com/video/LgHfUnd3j2ff/"]] },
  { title: "🔬#MESExperiments 31: Mechanical Demonstration of Inertia by Francis McCabe", image: "https://i.ytimg.com/vi/hsZgypWKGjE/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=hsZgypWKGjE"], ["Hive", "https://peakd.com/@mes/eysvgejq"], ["3Speak", "https://3speak.tv/watch?v=mes/eysvgejq"], ["Rumble", "https://rumble.com/v40mjo1-mesexperiments-31-mechanical-demonstration-of-inertia-by-francis-mccabe.html"], ["Odysee", "https://odysee.com/@mes:8/MESExperiments-31-Mechanical-Demonstration-of-Inertia:6"], ["BitChute", "https://www.bitchute.com/video/WqzUELIxF7Iz/"]] },
  { title: "🔬#MESExperiments 32: Comparing Tippe Top, Phi Top, and Gyroscope Rising Tests", image: "https://i.ytimg.com/vi/baaeRfhvJso/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=baaeRfhvJso"], ["Hive", "https://peakd.com/@mes/aryxzrkj"], ["3Speak", "https://3speak.tv/watch?v=mes/aryxzrkj"], ["Rumble", "https://rumble.com/v45ebef-mesexperiments-32-comparing-tippe-top-phi-top-and-gyroscope-rising-tests.html"], ["Odysee", "https://odysee.com/MESExperiments-32-Comparing-Tippe-Top-Phi-Top-Gyroscope-Rising-Tests:cf4780fe90410da1080a2d316f06f916485e86d9"], ["BitChute", "https://www.bitchute.com/video/iKOkGi3pmnjX/"]] },
    ],
  },
];

export const IMPORTANT_LINKS_HTML = `<ul>
<li><a href="https://mes.fm/moon">MES Moon, Sun, Planets &amp; Astronomy</a> &ndash; live Sun &amp; Moon dashboard for Richmond, BC (times, constellation, distance, magnitude)</li>
<li><a href="https://mes.fm/solar-system-today">MES Solar System Today</a> &ndash; where the Sun, planets, Moon and Halley's Comet are on any date</li>
<li><a href="https://mes.fm/earth-curvature-calculator">MES Earth Curvature Calculator</a> &ndash; drop, horizon distance and hidden height over any distance</li>
<li><a href="https://peakd.com/c/hive-128780">HIVE community</a></li>
<li><a href="https://www.reddit.com/r/AMAZINGMathStuff/">Reddit r/AMAZINGMathStuff</a></li>
<li><a href="https://peakd.com/hive-128780/@mes/messcience-2-vortex-math-part-1-number-theory-and-modular-arithmetic">Vortex Math</a></li>
<li><a href="https://peakd.com/hive-128780/@mes/messcience-3-overview-of-biology">Overview of Biology</a></li>
<li><a href="https://peakd.com/hive-128780/@mes/messcience-4-review-of-covid-19-virus-isolation-paper">Review of COVID-19 "Virus" Isolation Paper</a></li>
<li><a href="https://www.youtube.com/@FractalWoman">FractalWoman YouTube</a></li>
<li><a href="https://www.youtube.com/@AETHERscience">Ionel DINU YouTube</a></li>
</ul>
`;
