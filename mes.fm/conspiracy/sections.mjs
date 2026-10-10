// Content for mes.fm/conspiracy and its section pages. Hand-maintained; read by build.mjs.
//
// mes.fm/conspiracy used to be a flat page with Posts/Videos card grids and a link list. It is now a tile hub
// like mes.fm/911 and mes.fm/hutchison (build.mjs is cloned from 911/build.mjs): one icon tile each for
// Posts and Videos, linking to mes.fm/conspiracy-posts and mes.fm/conspiracy-videos. Add new things at the
// TOP of the right section (newest first) and run `npm run build`.
//
// Item shapes (same as mes.fm/911/sections.mjs):
//   { href, title }                                 a mes.fm mirror page: thumbnail + excerpt scraped at build
//                                                   time and cached in link-meta.json
//   { title, image, links: [[label, href], ...] }   everything spelled out

export const SECTIONS = [
  {
    id: "conspiracy-posts",
    title: "Posts",
    items: [
  { title: "Is Drew Ponder Ashton Forbes' AI MH370 Spam Bot?", image: "https://img.leopedia.io/DQme9Zc6tLWjeJwJLbWAqV6vgUp2B3QMP8pwKSFk2mLLJSi/telegram-cloud-photo-size-1-5062375328306632663-y.jpg", links: [["mes.fm", "https://mes.fm/mh370-drew-ponder-spammer"]] },
  { href: "https://mes.fm/alex-jones-steven-greer-live", title: "Alex Jones Teams Up with UFO Expert Steven Greer" },
  { href: "https://mes.fm/humanoid-robot-soldiers-ukraine", title: "USA Delivers Humanoid Robot Soldiers to Ukraine" },
  { href: "https://mes.fm/hands-dan-dicks-carney-bloomberg-connolly", title: "Illuminati Hands: Dan Dicks, Mark Carney, Mike Bloomberg, Catherine Connolly" },
  { href: "https://mes.fm/trump-aliens-war-moon", title: "MES Alt-News Checkup — Trump Teaming Up with Aliens to Fight a War on the Moon?" },
  { href: "https://mes.fm/alex-jones-ashton-forbes-clowns", title: "Ashton Forbes and Alex Jones Team Up to Become the Most Unstoppable Clownish Force" },
  { href: "https://mes.fm/tim-pool-flat-earth-dave-clowns", title: "Tim Pool Interviews Flat Earth Dave — Not Even His Lowest Interview" },
  { href: "https://mes.fm/ufo-iran-2026-1976", title: "UFO Spotted in Iran in September 2026 and 1976" },
  { href: "https://mes.fm/bob-greenyer-con-man-subscriber", title: "Bob Greenyer's Subscriber Calls Him a Rich Fake Con Man" },
  { href: "https://mes.fm/stock-market-vs-oil", title: "The Top 10 S&P 500 Stocks Are 41% of the Market, and Oil Is at Record Lows Vs. Stocks" },
  { href: "https://mes.fm/rudy-giuiliani-medal-cross-dress-trump", title: "Trump Gives Cross-Dressing BFF Rudy Giuliani a Presidential Medal of Freedom" },
  { href: "https://mes.fm/swim-iran-nukes", title: "MES Goes Undercover to Check If Iran Built Underwater Mini-Nukes" },
  { href: "https://mes.fm/eyesiswatchin-donate", title: "EyesIsWatchin Update" },
  { href: "https://mes.fm/debt-military-iran-war", title: "Jerusalem Post: Forgive Debt to Enlist a Million Troops for an Iran Ground War" },
  { href: "https://mes.fm/news-ww3-moon", title: "MES News Checkup — Has WW3 Started Already?" },
  { href: "https://mes.fm/boy-dress-amputee-ad", title: "BC Children's Hospital Foundation Ad: A Brown Boy in a Dress with an Amputee Leg" },
  { href: "https://mes.fm/bill-gates-ai-warning", title: "Jeffrey Epstein's Friend Bill Gates Warns of AI Gettin' Too Powerful" },
  { href: "https://mes.fm/hyperliquid-flagged-address", title: "The Hyperliquid Crypto Exchange Flagged My Wallet Address" },
  { href: "https://mes.fm/lightning-forest-fires", title: "Lightning Causin' Forest Fires" },
    ],
  },
  {
    id: "conspiracy-videos",
    title: "Videos",
    items: [
  { href: "https://mes.fm/energy-vampire", title: "Disinfo Agents Literally Are Energy Vampires 😂😅😳" },
  { href: "https://mes.fm/president-stephen-a-smith", title: "Stephen A. Smith Possibly Alluding to His Presidential Bid" },
  { href: "https://mes.fm/ashton-forbes-letter", title: "Highlights from the Letter that Ashton Forbes Totally Didn't Write to Himself" },
    ],
  },
];

export const IMPORTANT_LINKS_HTML = `<ul>
<li><a href="https://peakd.com/c/hive-106474">HIVE community</a></li>
<li><a href="https://www.reddit.com/r/ConspiracyMES/">Reddit r/ConspiracyMES</a></li>
<li>X Threads</li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1717628655034306592">War with Iran</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1668341949697515520">Shooters hearing voices</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0E1tEkmKt1E-8rlSzzpcb8y">Crop Circles playlist</a></li>
<li><a href="https://www.bitchute.com/channel/LzzSQpmQ4HUK/">EyesIsWatchin</a></li>
<li><a href="https://t.me/methylstopdocumentaries">Methyl's Top Documentaries</a></li>
</ul>
`;
