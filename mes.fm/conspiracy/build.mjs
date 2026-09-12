// Build-time generator for the "Posts" and "Videos" sections of
// mes.fm/conspiracy.
//
// Unlike mes.fm/911 or mes.fm/hutchison, this page is NOT a mirrored Hive
// post -- it's a hand-authored link hub. This script only regenerates the
// Posts/Videos thumbnail-card grids (scraping each linked page's og: tags,
// same treatment as mes.fm/911's Posts/Videos); everything else on the page
// (the flat link list, ad scripts, theme toggle, footer) lives in the
// STATIC_HTML template below and should be hand-edited directly.
//
// This is NOT run by Vercel -- run it manually (`npm run build`) whenever you
// add a Post/Video or want to refresh thumbnails/excerpts, then commit the
// regenerated index.html.
//
// Usage:
//   npm install
//   npm run build

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Committed cache of link metadata scraped from each Posts/Videos card target
// (see resolveAllMeta). Kept in git so a later build still has thumbnails and
// excerpts even if a source host is briefly unreachable.
const META_CACHE_PATH = join(__dirname, "link-meta.json");

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Topic-homepage card grid — shared treatment (fetchMeta / resolveAllMeta /
// buildCardGrid + the .card-grid/.link-card CSS in the template below). Kept
// in sync with the identical block in mes.fm/911/build.mjs and
// mes.fm/hutchison/build.mjs.
// ---------------------------------------------------------------------------

function loadMetaCache() {
  if (!existsSync(META_CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(META_CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveMetaCache(cache) {
  const sorted = Object.fromEntries(
    Object.keys(cache).sort().map((k) => [k, cache[k]])
  );
  writeFileSync(META_CACHE_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Pull one <meta property="og:*"> (or name="...") content value out of raw HTML,
// tolerating either attribute order. Regex-based, matching the repo's other
// HTML-repair scripts (no DOM parser dependency).
function readMetaTag(html, prop) {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match each quoted value to its own opening quote (\2 backreference) so a
  // literal apostrophe inside a double-quoted content="..." doesn't truncate it.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=(["'])${p}\\1[^>]*\\bcontent=(["'])([\\s\\S]*?)\\2`, "i"),
    new RegExp(`<meta[^>]+\\bcontent=(["'])([\\s\\S]*?)\\1[^>]*(?:property|name)=(["'])${p}\\3`, "i"),
  ];
  for (let idx = 0; idx < patterns.length; idx++) {
    const m = html.match(patterns[idx]);
    if (m) return decodeEntities(idx === 0 ? m[3] : m[2]).trim();
  }
  return "";
}

// Trailing "— Mirrored from the Hive blockchain…" style boilerplate that every
// mirror page's og:description carries; drop it from the card excerpt.
function cleanExcerpt(text, maxLen = 150) {
  let out = text
    .replace(/\s*[-–—]*\s*mirrored from the hive blockchain.*$/i, "")
    .replace(/\s*[-–—]*\s*mirrored from hive.*$/i, "")
    .trim();
  if (out.length > maxLen) {
    const slice = out.slice(0, maxLen);
    const lastSpace = slice.lastIndexOf(" ");
    out = (lastSpace > 60 ? slice.slice(0, lastSpace) : slice).replace(/[.,;:!?–—-]+$/, "") + "…";
  }
  return out;
}

async function fetchMeta(url) {
  const res = await fetch(url, { headers: { "User-Agent": "mes.fm-build/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return {
    image: readMetaTag(html, "og:image"),
    title: readMetaTag(html, "og:title"),
    excerpt: cleanExcerpt(
      readMetaTag(html, "og:description") || readMetaTag(html, "description")
    ),
  };
}

// Fetch metadata for every card target with a small concurrency cap. A failed
// fetch keeps whatever the committed cache already had for that URL.
async function resolveAllMeta(entries, concurrency = 6) {
  const cache = loadMetaCache();
  const urls = entries.map((e) => e.href);
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        cache[url] = await fetchMeta(url);
        console.log(`  meta ok:   ${url}`);
      } catch (err) {
        console.warn(`  meta FAIL: ${url} (${err.message}) — using cached value`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  saveMetaCache(cache);
  return cache;
}

// Some Hive image URLs carry an unescaped apostrophe in their filename (a
// "#filename" fragment some old steemitimages.com uploads use), which would
// otherwise prematurely close the quoted url('...') below and drop the whole
// background-image. Percent-encode it so the string stays a valid CSS <url>.
function cssSafeUrl(url) {
  return String(url).split("'").join("%27");
}

// Render a link section as a responsive thumbnail-card grid.
function buildCardGrid(id, label, entries, meta, cta = "Read more") {
  const cards = entries
    .map((entry) => {
      const m = meta[entry.href] || {};
      const title = entry.title || m.title || entry.href;
      const thumbStyle = m.image
        ? ` style="background-image:url('${cssSafeUrl(escapeHtml(m.image))}')"`
        : "";
      const excerpt = m.excerpt
        ? `<span class="link-card-excerpt">${escapeHtml(m.excerpt)}</span>`
        : "";
      return `<a class="link-card" href="${escapeHtml(entry.href)}">
  <span class="link-card-thumb"${thumbStyle}></span>
  <span class="link-card-body">
    <span class="link-card-title">${escapeHtml(title)}</span>
    ${excerpt}
    <span class="link-card-readmore">${escapeHtml(cta)} &rarr;</span>
  </span>
</a>`;
    })
    .join("\n");

  return `<div class="collapsible-section">
<h2 class="sub-heading" onclick="toggleSubList('${id}')">${label} <span id="arrowIcon-${id}" class="arrow-icon" style="font-size: 75%;">&#9660;</span></h2>
<div id="${id}" class="card-grid collapsible">
${cards}
</div>
</div>`;
}

// "Posts" and "Videos" -- hand-maintained lists of mirrored mes.fm pages that
// get added to whenever a new one is published. Add a { href, title } entry
// at the TOP of the relevant list (newest first); the thumbnail + excerpt are
// scraped from the target page's og: tags at build time and cached in
// link-meta.json.
const POSTS = [
  { href: "https://mes.fm/eyesiswatchin-donate", title: "EyesIsWatchin Health Update" },
  { href: "https://mes.fm/debt-military-iran-war", title: "Jerusalem Post: Forgive Debt to Enlist a Million Troops for an Iran Ground War" },
  { href: "https://mes.fm/news-ww3-moon", title: "MES News Checkup — Has WW3 Started Already?" },
  { href: "https://mes.fm/boy-dress-amputee-ad", title: "BC Children's Hospital Foundation Ad: A Brown Boy in a Dress with an Amputee Leg" },
  { href: "https://mes.fm/bill-gates-ai-warning", title: "Jeffrey Epstein's Friend Bill Gates Warns of AI Gettin' Too Powerful" },
  { href: "https://mes.fm/hyperliquid-flagged-address", title: "The Hyperliquid Crypto Exchange Flagged My Wallet Address" },
  { href: "https://mes.fm/lightning-forest-fires", title: "Lightning Causin' Forest Fires" },
];

const VIDEOS = [
  { href: "https://mes.fm/president-stephen-a-smith", title: "Stephen A. Smith Possibly Alluding to His Presidential Bid" },
  { href: "https://mes.fm/one-armed-twin", title: "Occult Connections: The One-Armed Twin in Star Wars, 9/11, and The Matrix" },
  { href: "https://mes.fm/ashton-forbes-letter", title: "Highlights from the Letter that Ashton Forbes Totally Didn't Write to Himself" },
];

function buildPage(meta) {
  const postsGridHtml = buildCardGrid("posts", "Posts", POSTS, meta, "Read more");
  const videosGridHtml = buildCardGrid("videos", "Videos", VIDEOS, meta, "Watch");

  return `
<!DOCTYPE html>
<html>
<head>
  <link rel="canonical" href="https://mes.fm/conspiracy" />
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="MES Conspiracy - Links, notes, and mirrored posts on conspiracy topics investigated by MES, including war psyops, mass shootings, crop circles, and more.">
  <meta name="keywords" content="MES, Conspiracy, Math Easy Solutions">
  <meta name="author" content="Mathiew Estepho">
  <link rel="icon" href="https://mes.fm/img/favicon.ico?v=1.0" type="image/x-icon" />
  <title>MES Conspiracy</title>
  <style>
    h1 {
      text-align: center;
      font-size: 3.2em;
    }

    .page-header {
      position: relative;
      display: flex;
      justify-content: center;
    }

    .page-header .theme-toggle-btn {
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
    }

    .list-header {
      cursor: pointer;
    }

    .arrow-icon {
      font-size: 20px;
      display: inline-block;
      vertical-align: middle;
      transition: transform 0.3s ease;
    }

    .hidden {
      display: none;
    }

    .top-bar {
      max-width: 900px;
      margin: 0 auto;
    }

    ul {
      list-style-type: none;
      padding: 0;
    }

    li {
      margin-bottom: 10px;
    }

    body {
      font-weight: 550;
      word-wrap: break-word;
      transition: background-color 0.3s, color 0.3s;
      padding: 0 1.5em 3em;
    }

    body.light {
      background-color: #ffffff;
      color: #000000;
    }

    body.light a {
      color: #0000ff;
    }

    body.dark {
      background-color: #1a1a1a;
      color: #ffffff;
    }

    body.dark a {
      color: #4da8ff;
    }

    .content {
      max-width: 900px;
      margin: 0 auto;
    }

    .list-container {
      margin-bottom: 1.5em;
    }

    .sub-heading {
      font-size: 1.1em;
      cursor: pointer;
    }

    /* Wide band for the Posts/Videos card grids -- reads bigger than the
       900px flat-link-list column below, same treatment as mes.fm/911 and
       mes.fm/hutchison. */
    .wide {
      max-width: 1180px;
      margin: 1.5em auto;
    }

    .collapsible-section {
      margin-bottom: 1.5em;
    }

    /* Topic-homepage card grid — see buildCardGrid() in build.mjs. Kept in
       sync with the identical block in mes.fm/911/build.mjs and
       mes.fm/hutchison/build.mjs. */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin: 0.6em 0 0.4em;
    }

    .link-card {
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(128, 128, 128, 0.35);
      border-radius: 8px;
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .link-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
    }

    /* Override the global body.light/body.dark anchor colour (higher
       specificity than .link-card) so the card title/excerpt read as body
       text, not link blue. The "Read more"/"Watch" span opts back into the
       link colour below. */
    body.light .link-card { background-color: #fafafa; color: #000000; }
    body.dark .link-card { background-color: #232323; color: #ffffff; }

    .link-card-thumb {
      width: 100%;
      aspect-ratio: 16 / 9;
      background-color: #333333;
      background-image: linear-gradient(135deg, #2a2a2a, #4a4a4a);
      background-size: cover;
      background-position: center;
    }

    .link-card-body {
      padding: 0.6rem 0.8rem 0.8rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      flex: 1;
    }

    .link-card-title {
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1.3;
      color: inherit;
    }

    .link-card-excerpt {
      font-size: 0.8rem;
      opacity: 0.7;
      line-height: 1.4;
      flex: 1;
      color: inherit;
    }

    .link-card-readmore {
      font-size: 0.8rem;
      font-weight: 600;
    }

    body.light .link-card-readmore { color: #1a6fb0; }
    body.dark .link-card-readmore { color: #6cb6f5; }

    @media (max-width: 900px) {
      .card-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 560px) {
      .card-grid { grid-template-columns: 1fr; }
    }

    @media screen and (max-width: 600px) {
      h1 {
        font-size: 2.4em;
      }
      h2 {
        font-size: 1.5em;
      }
      .page-header {
        flex-direction: column;
      }
      .page-header .theme-toggle-btn {
        position: static;
        transform: none;
        margin-top: 0;
      }
    }

    .theme-toggle-btn {
      margin: 10px;
      width: 2.25em;
      height: 2.25em;
      padding: 0;
      border: 1.5px solid rgba(0, 0, 0, 0.15);
      border-radius: 50%;
      cursor: pointer;
      font-size: 1.1em;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    body.light .theme-toggle-btn {
      background-color: #3a3d52;
      border-color: rgba(255, 255, 255, 0.35);
    }

    /* Dark mode shows the sun icon (offering a switch to light). A warm
       cream fill plus a solid gold ring gives it presence without relying
       on the glyph's own (inherently light) coloring to carry the
       contrast. */
    body.dark .theme-toggle-btn {
      background-color: #fff3d6;
      border: 2px solid #e0a940;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    }

    .back-link {
      display: inline-block;
      margin: 0.5em 0 0;
    }
  /* RESPONSIVE-FIX-INSERTED */
@media (max-width: 768px) {
  .outer-container { width: 100% !important; margin: 0 !important; }
  .outer-page-content { width: 100% !important; display: block !important; }
  .side-bar { width: 100% !important; float: none !important; }
  .page-box { width: auto !important; display: block !important; margin: 0 auto 0.5em auto !important; }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
}
</style>
  <!-- ADSENSE-DEFERRED: load adsbygoogle.js (auto ads + consent) on the first
     real interaction (scroll / pointer / key), or after a 15s idle fallback,
     so its ad + consent JS (doubleclick ads ~100KB, Funding Choices ~70KB,
     sodar, osd) never runs during the page-load / Lighthouse trace window. -->
    <script>
    (function () {
      var EVT = ['scroll', 'pointerdown', 'keydown', 'touchstart'];
      var done = false;
      function go() {
        if (done) return;
        done = true;
        EVT.forEach(function (e) { removeEventListener(e, go); });
        var s = document.createElement('script');
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1461238060884369';
        document.head.appendChild(s);
      }
      EVT.forEach(function (e) { addEventListener(e, go, { passive: true }); });
      setTimeout(go, 15000);
    })();
    </script>
<script>
/* autoads-header-gap-guard: guards two gaps against Google Auto ads (in-page ad blocks,
   class \`google-auto-placed\`), plus a third: Google's separate "annotation"
   text-ad format (chips styled like \`<div class="google-anno-skip
   google-anno-sc" aria-label="...">\`, a different Auto ads mechanism than
   the in-page blocks above -- rendered as small pill/badge buttons made to
   look like real nav links). 1) Logo header <-> nav bar: on desktop, any
   in-page ad caught here is relocated to just below the whole
   header+nav+logo-badge complex (before .outer-page-content) and allowed to
   show if it fills; on mobile (max-width: 768px, this repo's existing
   responsive breakpoint) it is hidden outright instead -- no ad shows below
   the nav bar on mobile at all. 2) Comments toggle (#comments-button) <->
   comments widget (#comments-box): on every device, any in-page ad caught
   here is relocated to just after the comments box and allowed to show if
   it fills. 3) Annotation chips (\`.google-anno-sc\`) anywhere inside #header,
   #footer, or .side-bar: hidden outright on every device. Unlike the in-page
   ad blocks, Google serves many of these annotation chips per page load, so
   removing the ones in these three zones doesn't cost the page its one
   shot at an ad the way deleting the in-page block did -- no relocate/poll
   needed, just hide on sight.
   In the first two cases Google's own placeholder-collapse doesn't reliably
   fire once we've moved the node, so we poll it: if no real ad iframe shows
   up within ~2s, we force the reserved space to 0 ourselves, so an unfilled
   slot never leaves a blank gap. */
(function () {
    function isMobile() {
        return window.matchMedia('(max-width: 768px)').matches;
    }
    function isBetween(before, after, el) {
        if (!before || !after) return false;
        return !!(before.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
               !!(after.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
    }
    function collapseIfUnfilled(node) {
        var attempts = 0;
        var poll = setInterval(function () {
            attempts++;
            if (!node.isConnected) {
                clearInterval(poll);
                return;
            }
            if (node.querySelector('iframe')) {
                clearInterval(poll);
                return;
            }
            if (attempts >= 10) {
                node.style.setProperty('display', 'none', 'important');
                clearInterval(poll);
            }
        }, 200);
    }
    function handleHeaderNavZone(node) {
        var header = document.getElementById('header');
        var nav = document.querySelector('.info-bar-container');
        if (!isBetween(header, nav, node)) return false;
        if (isMobile()) {
            node.style.setProperty('display', 'none', 'important');
            return true;
        }
        var target = document.querySelector('.outer-page-content');
        if (target) {
            target.before(node);
        } else if (nav) {
            nav.after(node);
        }
        collapseIfUnfilled(node);
        return true;
    }
    function handleCommentsZone(node) {
        var button = document.getElementById('comments-button');
        var box = document.getElementById('comments-box');
        if (!isBetween(button, box, node)) return false;
        box.after(node);
        collapseIfUnfilled(node);
        return true;
    }
    function inAnnotationGuardedZone(el) {
        return !!(el.closest('#header') || el.closest('#footer') || el.closest('.side-bar'));
    }
    function handleAnnotationChip(node) {
        if (node.classList && node.classList.contains('google-anno-sc') && inAnnotationGuardedZone(node)) {
            node.style.setProperty('display', 'none', 'important');
            return true;
        }
        return false;
    }
    function handle(node) {
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains('google-auto-placed')) {
            if (handleHeaderNavZone(node)) return;
            handleCommentsZone(node);
            return;
        }
        if (handleAnnotationChip(node)) return;
        if (node.querySelectorAll) {
            node.querySelectorAll('.google-auto-placed').forEach(function (n) {
                if (handleHeaderNavZone(n)) return;
                handleCommentsZone(n);
            });
            node.querySelectorAll('.google-anno-sc').forEach(function (n) {
                handleAnnotationChip(n);
            });
        }
    }
    new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
            m.addedNodes.forEach(handle);
        });
    }).observe(document.documentElement, {childList: true, subtree: true});
})();
</script>
</head>
<body>

  <div class="top-bar">
    <a class="back-link" href="https://mes.fm/links">&larr; MES Links</a>
  </div>

  <header class="page-header">
    <h1 class="list-header" onclick="toggleAllLists()">MES Conspiracy <span id="arrowIconAll" class="arrow-icon">&#9660;</span></h1>
    <button id="themeToggle" class="theme-toggle-btn">Loading...</button>
  </header>

  <div class="wide">
${postsGridHtml}
${videosGridHtml}
  </div>

  <div class="content">
    <ul>
      <li><a href="https://peakd.com/c/hive-106474">HIVE community</a></li>
      <li><a href="https://www.reddit.com/r/ConspiracyMES/">Reddit r/ConspiracyMES</a></li>
      <li>X Threads</li>
      <li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1717628655034306592">War with Iran</a></li>
      <li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1668341949697515520">Shooters hearing voices</a></li>
      <li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0E1tEkmKt1E-8rlSzzpcb8y">Crop Circles playlist</a></li>
      <li><a href="https://www.bitchute.com/channel/LzzSQpmQ4HUK/">EyesIsWatchin</a></li>
      <li><a href="https://t.me/methylstopdocumentaries">Methyl's Top Documentaries</a></li>
    </ul>
  </div>

  <script>
    function toggleAllLists() {
      const lists = document.querySelectorAll('.collapsible');
      const arrowIconAll = document.getElementById('arrowIconAll');
      lists.forEach(list => list.classList.toggle('hidden'));
      arrowIconAll.textContent = lists.length && lists[0].classList.contains('hidden') ? '▲' : '▼';
    }

    function toggleSubList(listId) {
      const list = document.getElementById(listId);
      const arrowIcon = document.getElementById(\`arrowIcon-\${listId}\`);
      list.classList.toggle('hidden');
      arrowIcon.textContent = list.classList.contains('hidden') ? '▼' : '▲';
    }
  </script>

  <script>
    // Dark/Light theme toggle – saved in browser (no POST, no resubmit popup)
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;

    function setTheme(isDark) {
      if (isDark) {
        body.classList.add('dark');
        body.classList.remove('light');
        themeToggle.textContent = '☀️';
        try { localStorage.setItem('theme', 'dark'); } catch (e) {}
      } else {
        body.classList.add('light');
        body.classList.remove('dark');
        themeToggle.textContent = '🌙';
        try { localStorage.setItem('theme', 'light'); } catch (e) {}
      }
    }

    let saved;
    try { saved = localStorage.getItem('theme'); } catch (e) { saved = null; }
    if (saved === 'light') {
      setTheme(false);
    } else {
      setTheme(true);
    }

    themeToggle.addEventListener('click', () => {
      const isDarkNow = body.classList.contains('dark');
      setTheme(!isDarkNow);
    });
  </script>

  <div style="clear: both;"></div>


  <footer style="text-align: center;">
    <p>&copy; 2026 Math Easy Solutions (MES). All rights reserved. | <a href="https://mes.fm/contact">Contact Us</a> | <a href="https://mes.fm/privacy-policy">Privacy Policy</a></p>
  </footer>

  <!-- PAGEVIEW-TRACKING-INSERTED --><script src="/main_js/track.js" defer></script></body>
</html>
`;
}

async function main() {
  console.log(`Resolving card metadata for ${POSTS.length + VIDEOS.length} links ...`);
  const meta = await resolveAllMeta([...POSTS, ...VIDEOS]);

  const html = buildPage(meta);
  const outPath = join(__dirname, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
