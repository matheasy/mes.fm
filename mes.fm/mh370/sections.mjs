// Content for mes.fm/mh370 ("MH370 Teleportation Psyop") and its Videos page. Hand-maintained; read by build.mjs.
//
// mes.fm/mh370 is a small tile hub like mes.fm/conspiracy (build.mjs is cloned from conspiracy/build.mjs): one icon
// tile (Videos -> mes.fm/mh370-videos) plus the "Important Links" list that used to live only in the MH370 PsyOp
// section of mes.fm/links. Add new videos at the TOP of the list (newest first) and run `npm run build`.
//
// The MES livestreams and their trailers are NOT listed here: they live on mes.fm/livestreams (the MH370 filter chip,
// mes.fm/livestreams#mh370), which the hub's second tile links to.
//
// The Videos items mirror the MES MH370 YouTube playlist
// (https://www.youtube.com/playlist?list=PLai3U8-WIK0EJGgDKXr-wW8z1jd7pZ069), in playlist order. Item shape:
//   { title, image, links: [[label, href], ...] }   the card goes to its first mes.fm link, else the first link

export const SECTIONS = [
  {
    id: "mh370-videos",
    title: "Videos",
    standalone: [
      { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EJGgDKXr-wW8z1jd7pZ069", title: "MES MH370 Video Playlist" },
    ],
    items: [
  { title: "MH370 Teleportation Video Fakery: Contrails are Out of Sync with Plane", image: "https://i.ytimg.com/vi/fkPGiTChZLE/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=fkPGiTChZLE"]] },
  { title: "MH370 Teleportation Video Fakery: Clouds Stock Footage Found!!", image: "https://i.ytimg.com/vi/gja-PGvv8fE/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=gja-PGvv8fE"]] },
  { title: "MH370 Teleportation Video Fakery: UFO Orb Hole in Cloud HOAX", image: "https://i.ytimg.com/vi/76egP8Fjas0/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=76egP8Fjas0"]] },
  { title: "MH370 Teleportation Video Fakery: UFO Orb Rotates Wrong Way", image: "https://i.ytimg.com/vi/frWD3cJ4L_A/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=frWD3cJ4L_A"]] },
  { title: "MH370 Teleportation Video Fakery: Duplicate Frames (NOT Video Compression)", image: "https://i.ytimg.com/vi/tazw6CAcrKo/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=tazw6CAcrKo"]] },
  { title: "Bob Greenyer \"analyzing\" MH370 cartoons vs MES analyzing MH370 cartoons", image: "https://i.ytimg.com/vi/FKKwdsbacQ8/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=FKKwdsbacQ8"]] },
  { title: "Bob Greenyer discussin' the MH370 teleportation cartoons...", image: "https://i.ytimg.com/vi/958uIfIgjQY/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=958uIfIgjQY"]] },
  { title: "Highlights from the Letter that Ashton Forbes totally didn't write to himself 🤣", image: "https://i.ytimg.com/vi/zMXxyKljWA4/maxresdefault.jpg", links: [["mes.fm", "https://mes.fm/ashton-forbes-letter"], ["YouTube", "https://www.youtube.com/watch?v=zMXxyKljWA4"]] },
    ],
  },
  {
    id: "mh370-posts",
    title: "Posts",
    items: [
  { title: "Is Drew Ponder Ashton Forbes' AI MH370 Spam Bot?", image: "https://img.leopedia.io/DQme9Zc6tLWjeJwJLbWAqV6vgUp2B3QMP8pwKSFk2mLLJSi/telegram-cloud-photo-size-1-5062375328306632663-y.jpg", links: [["mes.fm", "https://mes.fm/mh370-drew-ponder-spammer"]] },
  { title: "MES Alt-News Checkup — Trump Teaming Up with Aliens to Fight a War on the Moon?", image: "https://img.leopedia.io/DQmfJr7Z7RwMXZtw8rYseuC874Mwe6LAAi2AJ11yLu63i4V/telegram-cloud-photo-size-1-5019279171192032458-y.jpg", links: [["mes.fm", "https://mes.fm/trump-aliens-war-moon"]] },
  { title: "Ashton Forbes and Alex Jones Team Up to Become the Most Unstoppable Clownish Force", image: "https://images.hive.blog/0x0/https://snipboard.io/LYFACI.jpg", links: [["mes.fm", "https://mes.fm/alex-jones-ashton-forbes-clowns"]] },
    ],
  },
];

export const IMPORTANT_LINKS_HTML = `<ul>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0EJGgDKXr-wW8z1jd7pZ069">MES MH370 Video Playlist</a></li>
<li><a href="https://t.me/meslinks/21412">Links to Alleged Teleportation Videos</a></li>
<li><a href="https://peakd.com/hive-106474/@mes/interesting-timings-relating-to-the-mh370-teleportation-psyop">Interesting Timings regarding MH370 and Russia-Ukraine War</a></li>
<li><a href="https://t.me/meslinks/21840">Clouds Stock Footage</a></li>
<li>Ashton Forbes:</li>
<li style="margin-left: 20px;"><a href="https://t.me/meslinks/21417">Lying about VFX stock footage</a></li>
<li style="margin-left: 20px;"><a href="https://youtu.be/26lWfya0xSI">Lying about RegicideAnon being a random UFO YouTuber that posted videos prior to MH370.</a></li>
<li style="margin-left: 20px;"><a href="https://t.me/meslinks/21796">Blocking people that bring up 9/11 or call him out for lying.</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/JustXAshton/status/1731463449530569204">Posting orb hole in clouds hoax.</a> - <a href="https://www.reddit.com/r/AirlinerAbduction2014/comments/18apo5q/here_are_the_original_frames_processed_back_and/">Original videos don't show hole</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/JustXAshton/status/1720450218682933277">Wants to remove anonymity from the internet.</a></li>
<li style="margin-left: 20px;"><a href="https://youtu.be/6ieLc6Fjcto">Believes the mainstream narrative on ISIS, terrorism, and 9/11.</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0HUv8mv9gzQc3Ej4csHIQb3">Tengri 137 alien math Role Playing Game (RPG) psyop (similar to MH370)</a></li>
</ul>
`;
