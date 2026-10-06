// Content for mes.fm/bg ("Bob Greenyer") and its Videos + Posts pages. Hand-maintained; read by build.mjs.
//
// mes.fm/bg is a small tile hub like mes.fm/mh370 (build.mjs is cloned from mh370/build.mjs): a Videos tile, a Posts tile and the
// "Important Links" list. Add new items at the TOP of a list (newest first) and run `npm run build`.
//
// The Videos items mirror the MES YouTube playlist "Bob Greenyer says the darnedest things"
// (https://www.youtube.com/playlist?list=PLdwkvCI5-tzw, short URL https://mes.fm/bg-wildin), in playlist order. Item shape:
//   { title, image, links: [[label, href], ...] }   the card goes to its first mes.fm link, else the first link
// The old "BG & NS Links" page (Bob Greenyer's claims about Dr. Judy Wood and 9/11) moved from mes.fm/bg to mes.fm/bg-notes.

export const SECTIONS = [
  {
    id: "bg-videos",
    title: "Videos",
    standalone: [
      { href: "https://www.youtube.com/playlist?list=PLdwkvCI5-tzw", title: "Bob Greenyer Says the Darnedest Things (YouTube playlist)" },
    ],
    items: [
  { title: "Bob Greenyer \"analyzing\" MH370 cartoons vs MES analyzing MH370 cartoons", image: "https://i.ytimg.com/vi/FKKwdsbacQ8/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=FKKwdsbacQ8"]] },
  { title: "Bob Greenyer says steel firetruck is made of aluminum", image: "https://i.ytimg.com/vi/DjkS-1Yo12Q/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=DjkS-1Yo12Q"]] },
  { title: "Trailer for MES Livestream 137: Send in the 9/11 Disinfo Clowns", image: "https://i.ytimg.com/vi/7ZzSGG0wwso/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=7ZzSGG0wwso"]] },
  { title: "Dr. Judy Wood asks: What does a dust baggie have to do with what happened to the towers on 9/11?", image: "https://i.ytimg.com/vi/5OHeLE6DiM8/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=5OHeLE6DiM8"]] },
  { title: "Bob Greenyer makes a complete clown of himself as he tries to \"explain\" Dr. Judy Wood's book cover 🤡", image: "https://i.ytimg.com/vi/m5PK60A2ztA/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=m5PK60A2ztA"]] },
  { title: "Bob Greenyer says if Germany won WW2, we would have time distortion ⏳ anti-gravity 🛸  free energy 🔋", image: "https://i.ytimg.com/vi/2r32XRWxcoQ/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=2r32XRWxcoQ"]] },
  { title: "Bob Greenyer says the yoga pose creates micro-ball lightning 💥🧘💥", image: "https://i.ytimg.com/vi/l4nigZVgchQ/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=l4nigZVgchQ"]] },
  { title: "Bob Greenyer makin' stuff up about atomic clocks and the Global Consciousness Project on 9/11...", image: "https://i.ytimg.com/vi/TEKiweBqQRo/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=TEKiweBqQRo"]] },
  { title: "Bob Greenyer discussin' his high level Freemason father and grandfather", image: "https://i.ytimg.com/vi/uIRTb4p3vuo/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=uIRTb4p3vuo"]] },
  { title: "Bob Greenyer discussin' the MH370 teleportation cartoons...", image: "https://i.ytimg.com/vi/958uIfIgjQY/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=958uIfIgjQY"]] },
    ],
  },
  {
    id: "bg-posts",
    title: "Posts",
    items: [
  { title: "Bob Greenyer's Subscriber Calls Him a Rich Fake Con Man", image: "https://img.leopedia.io/DQmTZmdAv4cnboKCKr4at5M1xuabiTn2VceMThQryfD4taw/telegram-cloud-photo-size-1-5005902109001583833-y.jpg", links: [["mes.fm", "https://mes.fm/bob-greenyer-con-man-subscriber"]] },
  { title: "9/11 Revisionist = 9/11 Spammer", image: "https://img.leopedia.io/DQmbpgZNh1aVMsLjBor5QupBNRbH4wS7ZFmbcoRMmmoPjPh/telegram-cloud-photo-size-1-4969851364699737239-y.jpg", links: [["mes.fm", "https://mes.fm/911-revisionist-spammer"]] },
  { title: "9/11 Revisionist Spammin' Dust Baggie Nonsense", image: "https://img.leopedia.io/DQmYTAsxYWVLfMYvmz8LcX6NMYwu3yMPdddfMXSTAek5rSu/telegram-cloud-photo-size-1-5001700763402708281-y.jpg", links: [["mes.fm", "https://mes.fm/911-spammer-dust-baggie"]] },
    ],
  },
];

export const IMPORTANT_LINKS_HTML = `<ul>
<li><a href="https://www.youtube.com/playlist?list=PLdwkvCI5-tzw">Bob Greenyer Says the Darnedest Things (YouTube playlist)</a> &mdash; short URL: <a href="https://mes.fm/bg-wildin">mes.fm/bg-wildin</a></li>
<li><a href="https://mes.fm/bg-notes">Bob Greenyer's Claims About Dr. Judy Wood &amp; 9/11</a> (notes and links)</li>
<li><a href="https://www.youtube.com/watch?v=xLe2uhz4ANs">MES Livestream 42: Bob Greenyer Discusses EVOs, LENR, and the Hutchison Effect</a></li>
</ul>
`;
