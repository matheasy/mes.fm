// Content for mes.fm/djw (Dr. Judy Wood hub) and its Posts / Space Shuttle Columbia pages. Hand-maintained; read by build.mjs.
//
// mes.fm/djw is a tile hub cloned from mes.fm/bg. It is deliberately NOT indexed (robots noindex on every page the build writes, plus an
// X-Robots-Tag header in vercel.json), and the build pages are left out of the sitemap / site search. Add new items at the TOP of a list
// (newest first) and run `npm run build`. Item shape: { title, image, links: [[label, href], ...] } (the card goes to its first mes.fm link).
// The old mes.fm/djw page (Dr. Judy Wood's response to Richard Gage's article) moved to mes.fm/gage-slander on 2026-11-09.

export const SECTIONS = [
  {
    id: "djw-posts",
    title: "Posts",
    items: [
  { title: "Richard Gage: \"We Are Necessarily Gatekeepers\" of 9/11 Truth 🤡", image: "https://mes.fm/richard-gage-gatekeeper/img/poster.jpg", links: [["mes.fm", "https://mes.fm/richard-gage-gatekeeper"], ["Hive", "https://peakd.com/@mestruth/richard-gage-we-are-necessa-456"]] },
  { title: "Dr. Judy Wood's Rebuttal to All the “Debunkers”", image: "https://mes.fm/judy-wood-rebuttal/img/judy-wood-rebuttal.jpg", links: [["mes.fm", "https://mes.fm/judy-wood-rebuttal"]] },
  { title: "Bob Greenyer's Claims About Dr. Judy Wood & 9/11", image: "https://mes.fm/img/bg-logo-big.jpg", links: [["mes.fm", "https://mes.fm/bg-notes"]] },
  { title: "Amaterasu Solar Bought a Dr. Judy Wood Quote Coffee Mug", image: "https://mes.fm/amaterasu-solar-judy-wood-quote/img/amaterasu-solar-judy-wood-quote-1.png", links: [["mes.fm", "https://mes.fm/amaterasu-solar-judy-wood-quote"], ["Hive", "https://peakd.com/@mestruth/re-leothreads-2shsrn9cj"]] },
  { title: "Dr. Judy Wood on the Total Disclosure Podcast", image: "https://mes.fm/drjudywood-total-disclosure-podcast/podcast.jpg", links: [["mes.fm", "https://mes.fm/drjudywood-total-disclosure-podcast"], ["Hive", "https://peakd.com/@mestruth/re-leothreads-rn7i2ltd"]] },
  { title: "Dr. Judy Wood Explains Toasted Cars on 9/11 and the “What’s It” Car", image: "https://images.3speak.tv/images/1789336916884-b171299940a0a3f8.webp", links: [["mes.fm", "https://mes.fm/whats-it-toasted-car"], ["Hive", "https://peakd.com/@mestruth/dr-judy-wood-explains-toast-247"]] },
  { title: "Dr. Judy Wood Live on the John B. Wells – Caravan to Midnight Show", image: "https://mes.fm/judy-wood-john-wells-live/img/judy-wood-caravan-to-midnight.jpg", links: [["mes.fm", "https://mes.fm/judy-wood-john-wells-live"], ["Hive", "https://peakd.com/@mestruth/re-leothreads-fajtbrkt"]] },
  { title: "Patrick Bet David Asks Former Congressman Curt Weldon About Dr. Judy Wood and Hurricane Erin", image: "https://images.3speak.tv/images/1788898632324-129dd27208920761.webp", links: [["mes.fm", "https://mes.fm/curt-weldon-pbd-podcast-dew"], ["Hive", "https://peakd.com/@mestruth/patrick-bet-david-asks-form-813"]] },
  { title: "Former Congressman Curt Weldon Brings Up Dr. Judy Wood and Directed Energy on the Jimmy Dore Show", image: "https://images.3speak.tv/images/1788846695342-ac5284cf4c9d325e.webp", links: [["mes.fm", "https://mes.fm/curt-weldon-jimmy-dore-dew"], ["Hive", "https://peakd.com/@mestruth/former-congressman-curt-wel-751"]] },
  { title: "Matthew Naus Gave G. Edward Griffin the WDTTTG Book in 2012", image: "https://mes.fm/matthew-naus-g-edward-griffin-wdtttg-book/img/naus-griffin-yYg38f.jpg", links: [["mes.fm", "https://mes.fm/matthew-naus-g-edward-griffin-wdtttg-book"], ["Hive", "https://peakd.com/@mestruth/re-leothreads-pcod2djd"]] },
  { title: "Someone Bought a 9/11 DJW Book Shirt and Hutchison Effect Shirt 📘🧲👕👕", image: "https://mes.fm/bought-911-hutchison-shirt/img/djw-book-shirt-sold.png", links: [["mes.fm", "https://mes.fm/bought-911-hutchison-shirt"], ["Hive", "https://peakd.com/@mestruth/re-leothreads-qpo3rs7h"]] },
  { title: "Mr. Richard Gage Doesn't Know if the Earth Is Round or Flat 😹🤡", image: "https://images.hive.blog/DQmU7JXmLDsiR95nv5ooN9RVxN8AWb1eBoDxN2new7GqaoG/image", links: [["mes.fm", "https://mes.fm/richard-gage-flat-earth"], ["Hive", "https://peakd.com/@mestruth/mr-richard-gage-doesnt-know-54"]] },
  { title: "Attorney Jerry Leaphart on NIST Hiring Military Contractors that Specialize in DEW and PsyOps", image: "https://images.3speak.tv/images/1787855690113-c41d6bde1988fa91.webp", links: [["mes.fm", "https://mes.fm/jerry-leaphart-dew"], ["Hive", "https://peakd.com/@mestruth/attorney-jerry-leaphart-on-213"]] },
  { title: "Story Time with Cat and Dr. Judy Wood's WDTTG Book", image: "https://mes.fm/cat-wdttg-book/img/cat-wdttg-1.jpg", links: [["mes.fm", "https://mes.fm/cat-wdttg-book"], ["Hive", "https://peakd.com/@mestruth/re-leothreads-39wnplwtq"]] },
  { title: "Dr. Judy Wood's Response to Mr. Gage's Libellous Article", image: "https://files.peakd.com/file/peakd-hive/drjudywood/244KV8rHQRR4YPe3umitEYA1QPzdtzWQFejvXxCseSBu9Ea1EUhnSk8GXRfCcNVmVkg6W.png", links: [["mes.fm", "https://mes.fm/gage-slander"], ["Hive", "https://peakd.com/@drjudywood/response-to-mr-gages-libellous-article-leo"]] },
    ],
  },
  {
    id: "djw-columbia",
    title: "Space Shuttle Columbia",
    items: [
  { title: "Dr. Judy Wood and MES: the Space Shuttle Columbia Emails", image: "https://mes.fm/space-shuttle-columbia/img/share.jpg", links: [["mes.fm", "https://mes.fm/djw-columbia-emails"]] },
  { title: "Dr. Judy Wood and MES: the Space Shuttle Columbia Emails (PDF)", image: "https://mes.fm/space-shuttle-columbia/img/share.jpg", links: [["mes.fm", "https://mes.fm/djw-columbia-emails-pdf"]] },
  { title: "Introduction and Space Shuttle Columbia Disaster News Footage", image: "https://mes.fm/columbia-disaster-introduction/img/share.jpg", links: [["mes.fm", "https://mes.fm/columbia-disaster-introduction"], ["Hive", "https://peakd.com/@mes/introduction-and-space-shut-435"]] },
  { title: "Exam Problem by Dr. Judy Wood: Space Shuttle Columbia Disaster", image: "https://mes.fm/space-shuttle-columbia/img/share.jpg", links: [["mes.fm", "https://mes.fm/space-shuttle-columbia"], ["Hive", "https://peakd.com/@mes/exam-problem-by-dr-judy-woo-59"]] },
  { title: "Space Shuttle Columbia Exam Problem: Notes (PDF)", image: "https://mes.fm/space-shuttle-columbia/img/share.jpg", links: [["mes.fm", "https://mes.fm/space-shuttle-columbia-pdf"]] },
  { title: "Space Shuttle Columbia Disaster Test Problem by Dr. Judy Wood", image: "https://mes.fm/em-304-problem-1-judy-wood/preview.jpg", links: [["mes.fm", "https://mes.fm/em-304-problem-1-judy-wood"]] },
    ],
  },
];

export const IMPORTANT_LINKS_HTML = `<ul>
<li><a href="/gage-slander">Dr. Judy Wood's Response to Mr. Gage's Libellous Article</a></li>
<li><a href="/djw-youtube">DJW YouTube playlist: every video, searchable</a> &mdash; <a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0HdmnNqdqxhSSd5jNSUtvKk">open on YouTube</a></li>
<li><a href="https://www.wheredidthetowersgo.com/">Where Did the Towers Go? (Dr. Judy Wood's book)</a></li>
<li><a href="https://peakd.com/@drjudywood">@drjudywood on Hive</a></li>
<li><a href="/911">MES 9/11 Truth</a> &middot; <a href="/911spooks">9/11 Spooks</a> &middot; <a href="/bg">Bob Greenyer</a></li>
</ul>
`;
