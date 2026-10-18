// Content for mes.fm/911spooks ("9/11 Spooks") and its Posts + Videos pages. Hand-maintained; read by build.mjs.
//
// Add new items at the TOP of a list (newest first) and run `npm run build`. Item shape:
//   { href, title }   a mes.fm mirror page (thumbnail + "Watch on:" row scraped and cached in link-meta.json)
// Posts = the former "Spooks" section of mes.fm/911; Videos = two videos moved from mes.fm/911-videos.

export const SECTIONS = [
  {
    id: "911spooks-posts",
    title: "Posts",
    items: [
      { href: "https://mes.fm/mh370-litmus-spooks", title: "MH370 Teleportation Cartoons are a Litmus Test for Spooks", who: "bob revisionist" },
      { href: "https://mes.fm/abby-martin-911-spook", title: "Abby Martin Outed Herself as a 9/11 Spook as Far Back as 2012" },
      { href: "https://mes.fm/911-revisionist-slander-mes", title: "9/11 Revisionist Slanders MES", who: "revisionist bob ryan" },
      { href: "https://mes.fm/energy-vampire", title: "Disinfo Agents Literally Are Energy Vampires 😂😅😳" },
      { href: "https://mes.fm/offguardian-911-spooks", title: "Another 9/11 Spook Outs Themselves: The OffGuardian X Account" },
      { href: "https://mes.fm/911-spammer-dust-baggie", title: "9/11 Revisionist Spammin' Dust Baggie Nonsense", who: "revisionist bob" },
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
    id: "911spooks-videos",
    title: "Videos",
    items: [
      { href: "https://mes.fm/richard-gage-flat-earth", title: "Mr. Richard Gage Doesn't Know if the Earth Is Round or Flat" },
      { href: "https://mes.fm/ashton-forbes-letter", title: "Highlights from the Letter that Ashton Forbes Totally Didn't Write to Himself" },
    ],
  },
];

export const IMPORTANT_LINKS_HTML = `<ul>
<li><a href="/911">MES 9/11 Truth</a>: videos, posts and the #911Truth series</li>
<li><a href="/livestreams#911">MES 9/11 Livestreams</a></li>
<li><a href="/bg">Bob Greenyer (BG)</a></li>
</ul>
`;
