// Content for mes.fm/science and its section pages. Hand-maintained; read by build.mjs.
//
// mes.fm/science used to be a flat page with Posts/Videos card grids and a link list. It is now a tile hub
// like mes.fm/911 and mes.fm/hutchison (build.mjs is cloned from 911/build.mjs): one icon tile each for
// Posts and Videos, linking to mes.fm/science-posts and mes.fm/science-videos. Add new things at the
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
    items: [
  { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0GhjCHmTw1XbqMD_EdVKdd9", title: "#MESScience YouTube Playlist" },
  { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EAUu0aAxoZmkS83RI65m1N", title: "MES Science and Physics Videos Playlist" },
  { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EbRnMsUBx2RxlerL7GQuLX", title: "Vortex Math — Sections + BeneficenceTV Playlist" },
  { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FYO6bxFbBAtVJ9sDOJnH72", title: "Overview of Biology Playlist" },
  { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0E4aQ_cq4ZDD2WGiDU5vVgx", title: "Review of COVID-19 \"Virus\" Isolation Paper Playlist" },
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
