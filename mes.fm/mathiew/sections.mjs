// Content for mes.fm/mathiew ("Mathiew Personal Content") and its section pages. Hand-maintained; read by build.mjs.
//
// mes.fm/mathiew used to be a flat page with Posts/Videos card grids. It is now a tile hub like mes.fm/conspiracy
// (build.mjs is cloned from conspiracy/build.mjs): one icon tile each for Posts and Videos, linking to
// mes.fm/mathiew-posts and mes.fm/mathiew-videos. Add new things at the TOP of the right section (newest first) and
// run `npm run build` (the Posts tile follows the newest post automatically, see syncPostsTile() in build.mjs).
//
// Item shapes (same as mes.fm/conspiracy/sections.mjs):
//   { href, title }                                 a mes.fm mirror page: thumbnail + excerpt scraped at build
//                                                   time and cached in link-meta.json
//   { title, image, links: [[label, href], ...] }   everything spelled out

export const SECTIONS = [
  {
    id: "mathiew-posts",
    title: "Posts",
    items: [
      { href: "https://mes.fm/richmond-elections-sticker-2026", title: "Local Elections Requiring a Mandatory Mark of the BC, Canada Voting Sticker" },
      { href: "https://mes.fm/mathiew-not-robber", title: "MES Is NOT Robbin' a Bank #notarobber 🥷🌚" },
      { href: "https://mes.fm/haircut-neice", title: "Neice Gave Me a Haircut" },
      { href: "https://mes.fm/swim-iran-nukes", title: "MES Goes Undercover to Check If Iran Built Underwater Mini-Nukes" },
      { href: "https://mes.fm/full-moon-hat", title: "Full Moon Lookin' Like It's Got a Hat On" },
    ],
  },
  {
    id: "mathiew-videos",
    title: "Videos",
    items: [
      { href: "https://mes.fm/lightning-sky", title: "Lightning Lighting Up the Entire Sky" },
    ],
  },
];

export const IMPORTANT_LINKS_HTML = `<ul>
<li><a href="/conspiracy">MES Conspiracy</a>: alt-news checkups, videos and posts</li>
<li><a href="/memes">MES Memes</a></li>
<li><a href="/links">MES Links</a></li>
</ul>
`;
