// Content for mes.fm/science and its section pages. Hand-maintained; read by build.mjs.
//
// mes.fm/science used to be a flat page with Posts/Videos card grids and a link list. It is now a tile hub
// like mes.fm/911 and mes.fm/hutchison (build.mjs is cloned from 911/build.mjs): one icon tile each for
// Posts and Videos, linking to mes.fm/science-posts and mes.fm/science-videos. The Videos are the last 14 of the "MES Physics" YouTube playlist
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
];

export const IMPORTANT_LINKS_HTML = `<ul>
<li><a href="https://mes.fm/moon">MES Moon, Sun, Planets &amp; Astronomy</a> &ndash; live Sun &amp; Moon dashboard for Richmond, BC (times, constellation, distance, magnitude)</li>
<li><a href="https://peakd.com/c/hive-128780">HIVE community</a></li>
<li><a href="https://www.reddit.com/r/AMAZINGMathStuff/">Reddit r/AMAZINGMathStuff</a></li>
<li><a href="https://peakd.com/hive-128780/@mes/messcience-2-vortex-math-part-1-number-theory-and-modular-arithmetic">Vortex Math</a></li>
<li><a href="https://peakd.com/hive-128780/@mes/messcience-3-overview-of-biology">Overview of Biology</a></li>
<li><a href="https://peakd.com/hive-128780/@mes/messcience-4-review-of-covid-19-virus-isolation-paper">Review of COVID-19 "Virus" Isolation Paper</a></li>
<li><a href="https://www.youtube.com/@FractalWoman">FractalWoman YouTube</a></li>
<li><a href="https://www.youtube.com/@AETHERscience">Ionel DINU YouTube</a></li>
</ul>
`;
