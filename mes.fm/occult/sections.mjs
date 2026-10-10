// Content for mes.fm/occult ("MES Occult Video Series") and its pages mes.fm/occult-series and mes.fm/occult-videos. Hand-maintained; read by build.mjs. Add a new video at the TOP of the list (newest first).
//
// Videos mirror the YouTube playlist https://www.youtube.com/playlist?list=PLai3U8-WIK0EX_SJASwVeZMA-CMgu6-Ox ("MES Occult"); the livestreams in that playlist are
// the "Occult" chip of mes.fm/livestreams. Item shape: { title, image, links: [[label, href], ...] }; the card goes to its first mes.fm link, else the Hive notes (peakd).

export const SECTIONS = [
  {
    id: "occult-series",
    title: "Videos",
    standalone: [
      { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EX_SJASwVeZMA-CMgu6-Ox", title: "YouTube playlist", icon: "&#127916;" },
      { href: "/livestreams#occult", title: "MES Occult Livestreams", icon: "&#128250;" },
    ],
    items: [
  { title: "Strange Coincidences Involving Donald Trump's Birthday", image: "https://i.ytimg.com/vi/Yd0Ah2Komco/maxresdefault.jpg", links: [["Notes", "https://peakd.com/hive-106474/@mes/coincidences-involving-donald-trumps-birthday"], ["3Speak", "https://3speak.tv/watch?v=mes/epgnjlky"], ["YouTube", "https://youtu.be/Yd0Ah2Komco"], ["Odysee", "https://odysee.com/@mes:8/Coincidences-Involving-Donald-Trump-Birthday:4"], ["BitChute", "https://www.bitchute.com/video/la9cQSdiBWs9/"], ["Rumble", "https://rumble.com/v352g48--strange-coincidences-involving-donald-trumps-birthday.html"], ["Telegram", "https://t.me/meslinks/33340"]] },
  { title: "Pope Paul VI Audience Hall: Fazzini Resurrection Sculpture + Vatican Obelisk + Occult + MORE", image: "https://files.peakd.com/file/peakd-hive/mes/NEKu7w49-Pope20Audience20Hall20Jesus.jpeg", links: [["Notes", "https://peakd.com/religion/@mes/video-notes-pope-paul-vi-audience-hall-fazzini-resurrection-sculpture-vatican-obelisk-occult-more"], ["Odysee", "https://odysee.com/@mes:8/pope-paul-vi-audience-hall-fazzini:7"], ["BitChute", "https://www.bitchute.com/video/W8J9it1kQdhk/"]] },
  { title: "Pope Paul VI Audience Hall: Snake Bite in Vatican City + St. Peter's Keys to Heaven", image: "https://i.ytimg.com/vi/si_ICKvkq24/maxresdefault.jpg", links: [["Notes", "https://peakd.com/religion/@mes/video-notes-pope-paul-vi-audience-hall-snake-bite-in-vatican-city-st-peter-s-keys-to-heaven"], ["YouTube", "https://youtu.be/si_ICKvkq24"]] },
    ],
  },
  {
    id: "occult-videos",
    title: "Videos",
    items: [
  { href: "https://mes.fm/one-armed-twin", title: "Occult Connections: The One-Armed Twin in Star Wars, 9/11, and The Matrix" },
    ],
  },
];

// Copied from the "MES Occult" list of mes.fm/links (2026-10-09); keep the two in step by hand.
export const IMPORTANT_LINKS_HTML = `<h3>Links to Playlists and Notes</h3>
<ul>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0EX_SJASwVeZMA-CMgu6-Ox">YouTube Playlist</a>
<ul>
<li><a href="https://mes.fm/occult-playlist">mes.fm/occult-playlist</a></li>
<li><a href="https://peakd.com/hive-106474/@mes/coincidences-involving-donald-trumps-birthday">Trump Birthday Coincidences</a></li>
</ul></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0HIzqSVzEURzhMphO9ePJ22">Giza Pyramid Geometry Playlist</a></li>
<li><a href="https://mes.fm/gematria/">Gematria Calculator</a>
<ul>
<li><a href="https://1drv.ms/x/s!As32ynv0LoaIiKto0HBi5417FpcFqg">Excel Spreadsheet</a></li>
</ul></li>
<li>X Threads
<ul>
<li><a href="https://x.com/MathEasySolns/status/1828558964327620983">Musicians selling their souls to the devil</a></li>
</ul></li>
<li>&#128065; <a href="https://x.com/MathEasySolns/status/920827513592471552">Weird Eye Anomalies</a>
<ul>
<li><a href="https://mes.fm/eyes">mes.fm/eyes</a></li>
</ul></li>
<li>&#128591; <a href="https://x.com/MathEasySolns/status/1054947652071239680">Illuminati Hand Gang Signs</a>
<ul>
<li><a href="https://mes.fm/hands">mes.fm/hands</a></li>
</ul></li>
<li><a href="https://mes.fm/livestreams#occult">MES Occult Livestreams</a> (mes.fm/livestreams#occult)</li>
</ul>
<h3>More MES Series</h3>
<ul>
<li><a href="https://mes.fm/conspiracy">MES Conspiracy</a> &middot; <a href="https://mes.fm/911">9/11 Truth</a> &middot; <a href="https://mes.fm/livestreams">MES Livestreams</a> &middot; <a href="https://mes.fm/links">MES Links</a></li>
</ul>
`;
