// Content for mes.fm/mh370 ("MH370 Teleportation Psyop") and its Videos page. Hand-maintained; read by build.mjs.
//
// mes.fm/mh370 is a small tile hub like mes.fm/conspiracy (build.mjs is cloned from conspiracy/build.mjs): one icon
// tile (Videos -> mes.fm/mh370-videos) plus the "Important Links" list that used to live only in the MH370 PsyOp
// section of mes.fm/links. Add new videos at the TOP of the list (newest first) and run `npm run build`.
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
  { title: "Trailer for MES Livestream BLANK: MH370 Teleportation Video Fakery", image: "https://i.ytimg.com/vi/44AX8WdyyCI/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=44AX8WdyyCI"]] },
  { title: "MES Livestream BLANK: Joe Recreates MH370 Teleportation Videos LIVE", image: "https://i.ytimg.com/vi/qhgRrcAepqI/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=qhgRrcAepqI"]] },
  { title: "Trailer for MES Livestream 92: Ashton Forbes on MH370 Cartoons require a PhD in Butt Physics", image: "https://i.ytimg.com/vi/0H9KNQzfDXE/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=0H9KNQzfDXE"]] },
  { title: "MES Livestream 92: Engineer Discusses Impossible Physics of MH370 Teleportation Cartoons", image: "https://i.ytimg.com/vi/ieFB3r79J0A/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=ieFB3r79J0A"]] },
  { title: "Trailer for MES Livestream 86: Ashton Forbes Debunks MH370 Debunkers", image: "https://i.ytimg.com/vi/v6NAh7Pr5-4/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=v6NAh7Pr5-4"]] },
  { title: "MES Livestream 86: Debunking Ashton Forbes and the MH370 Teleportation Scam", image: "https://i.ytimg.com/vi/Cob8QGBJB2I/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=Cob8QGBJB2I"]] },
  { title: "MES Livestream 67: MH370 Teleportation Video Creator Joins the Show!", image: "https://i.ytimg.com/vi/JTpokZzTWBA/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=JTpokZzTWBA"]] },
  { title: "MES Livestream 58: Impossible Cell Phone Calls on 9/11 (and more MH370 Teleportation Hoax News)", image: "https://i.ytimg.com/vi/GSiOvaS4-s0/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=GSiOvaS4-s0"]] },
  { title: "MES Livestream 43: Investigating MH370x Origins", image: "https://i.ytimg.com/vi/YtMNbVhRkV0/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=YtMNbVhRkV0"]] },
  { title: "MES Livestream 13: MH370 Occult Deep Dive", image: "https://i.ytimg.com/vi/-5caOw4rUx8/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=-5caOw4rUx8"]] },
  { title: "MES Livestream 11: Emergency MH370 Broadcast", image: "https://i.ytimg.com/vi/C2vv4FjSh6o/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=C2vv4FjSh6o"]] },
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
