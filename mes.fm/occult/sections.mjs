// Content for mes.fm/occult ("MES Occult Video Series"). Hand-maintained; read by build.mjs. Add a new video at the TOP of the list (newest first).
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
];

export const IMPORTANT_LINKS_HTML = ``;
