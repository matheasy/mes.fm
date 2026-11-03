// Content for mes.fm/free-energy ("MES Free Energy") and its Series page mes.fm/free-energy-series. Hand-maintained; read by build.mjs.
//
// Parts 3, 2, 1 of the "#FreeEnergy Video Research Series" YouTube playlist (https://mes.fm/freeenergy-playlist), newest first (2026-10-08). The playlist's other
// videos (Fleischmann interviews, Tesla coil clips) are not included; Part 4 (Bruce DePalma) is not in the playlist yet. Add a new part at the TOP of the list.
// Item shape: { title, image, links: [[label, href], ...] }; the card goes to its first mes.fm link, else the Hive notes (peakd), else the first link.

export const SECTIONS = [
  {
    id: "free-energy-series",
    title: "Series",
    standalone: [
      { href: "/freeenergy-playlist", title: "YouTube playlist", icon: "&#127916;" },
      { href: "/freeenergy", title: "OneDrive all files", icon: "&#128193;" },
    ],
    items: [
  { title: "#FreeEnergy Part 3: Atomic Physics, Properties, Behavior Overview", image: "https://i.ytimg.com/vi/SLW2hcEWTEE/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=SLW2hcEWTEE"], ["Hive", "https://peakd.com/@mes/freeenergy-part-3-atomic-physics-properties-behavior-overview-more"], ["3Speak", "https://3speak.tv/watch?v=mes/rjnmpcar"], ["Rumble", "https://rumble.com/v4jhu39-freeenergy-part-3-atomic-physics-properties-behavior-overview.html"], ["Odysee", "https://odysee.com/@mes:8/FreeEnergy-Part-3-Atomic-Physics-Properties-Behavior-Overview:5"], ["BitChute", "https://www.bitchute.com/video/SLW2hcEWTEE/"]] },
  { title: "#FreeEnergy Part 2: Nuclear Physics Overview + Cold Fusion + MORE", image: "https://i.ytimg.com/vi/wMB5xmONX58/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=wMB5xmONX58"], ["Hive", "https://peakd.com/@mes/freeenergy-part-2-nuclear-physics-overview-cold-fusion-more"], ["3Speak", "https://3speak.tv/watch?v=mes/itascajr"], ["Odysee", "https://odysee.com/@mes:8/FreeEnergy-Part-2-Nuclear-Physics-Cold-Fusion:4"], ["BitChute", "https://www.bitchute.com/video/jtgLQeAIf91h/"]] },
  { title: "#FreeEnergy Part 1: Introduction to Suppressed Technology & Science", image: "https://i.ytimg.com/vi/0odnMzawafE/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=0odnMzawafE"], ["Hive", "https://peakd.com/@mes/video-notes-freeenergy-part-1-introduction-to-suppressed-technology-and-science-ai-nwo"], ["3Speak", "https://3speak.tv/watch?v=mes/lfzlmtux"], ["BitChute", "https://www.bitchute.com/video/2Qek7sV2xB8B/"]] },
    ],
  },
];

export const IMPORTANT_LINKS_HTML = `<h3>Links to Notes and Playlists</h3>
<ul>
<li><a href="https://mes.fm/freeenergy">OneDrive all files</a> (mes.fm/freeenergy)</li>
<li><a href="https://mes.fm/freeenergy-playlist">YouTube playlist</a> (mes.fm/freeenergy-playlist)</li>
</ul>
<h3>More MES Series</h3>
<ul>
<li><a href="https://mes.fm/experiments">MES Experiments</a> &middot; <a href="https://mes.fm/antigravity">Anti-Gravity</a> &middot; <a href="https://mes.fm/science">MES Science</a> &middot; <a href="https://mes.fm/hutchison">Hutchison Effect</a> &middot; <a href="https://mes.fm/cold-fusion-lenr">Cold Fusion / LENR</a> &middot; <a href="https://mes.fm/livestreams">MES Livestreams</a> &middot; <a href="https://mes.fm/links">MES Links</a></li>
</ul>
`;
