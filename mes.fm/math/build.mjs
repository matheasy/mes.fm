// Build-time generator for mes.fm/math ("MES Math Tutorials").
//
// This page is a hand-maintained link directory (no single Hive article body
// to fetch) -- SECTIONS below lists every video/article link, grouped the
// same way the page has always been grouped. At build time each item's
// primary ("Notes") link is scraped for its own og:image/og:title plus,
// where that link is a mes.fm-hosted mirror page, its own "Watch on: ..."
// row (see readWatchOnLinks) -- giving every item a real thumbnail and a
// List View link row ordered Notes -> 3Speak -> YouTube -> Telegram ->
// BitChute -> Odysee -> Rumble (whichever that item actually has).
//
// Reuses the Grid View / List View toggle architecture from
// mes.fm/vector-functions-problems-plus/build.mjs, widened for this page's
// .wide (1180px) template: Grid shows up to 5 cards/row, List shows up to 2
// full-thumbnail rows/row on wide screens (vs. that page's fixed 3 / 1).
//
// Usage:
//   npm install
//   npm run build

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Committed cache of scraped {image, watchLinks} per item URL. Kept in git so
// a later build still has thumbnails/links if a source page is briefly
// unreachable.
const META_CACHE_PATH = join(__dirname, "link-meta.json");

const CANONICAL = "https://mes.fm/math";

// ---------------------------------------------------------------------------
// Section + item data. `href` is each item's primary/"Notes" link (a mes.fm
// mirror page where one exists, otherwise the peakd/Hive article -- only the
// two Problems Plus entries below have a mes.fm link, matching how these
// have always been curated). `playlistHref`, where present, is the
// hand-curated YouTube link (a specific video or the section's whole
// playlist) -- used as the List View's YouTube link only when the item's own
// page doesn't already have a scraped "Watch on:" YouTube link.
// ---------------------------------------------------------------------------

const SECTIONS = [
  {
    id: "mathQaLivestreams",
    title: "MES Math Q/A Livestreams",
    playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0F1GgkU63uA9NIncxDS2q0-",
    items: [
      { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0F1GgkU63uA9NIncxDS2q0-", title: "Playlist" },
      { href: "https://mes.fm/math-qa-70-lorentz-force", title: "70: What is the Lorentz Force?", playlistHref: "https://youtube.com/live/BJ1zYm_ZCVw" },
    ],
  },
  {
    id: "cubicFormula",
    title: "Cubic Formula Proof",
    items: [
      { href: "https://peakd.com/hive-128780/@mes/dzekfnxh", title: "Cubic Formula Proof", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EF05ExjzLbB64NgUjoV1hl" },
    ],
  },
  {
    id: "infiniteSequence",
    title: "Infinite Sequences and Series",
    playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EXHAJ3vRg0T_kKEyPah1Lz",
    items: [
      { href: "https://peakd.com/mathematics/@mes/infinite-sequences-limits-squeeze-theorem-fibonacci-sequence-and-golden-ratio-more", title: "Infinite Sequences: Limits, Squeeze Theorem, Fibonacci Sequence & Golden Ratio", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0HUgfK34Voi6BvrNqt4X4BV" },
      { href: "https://peakd.com/mathematics/@mes/laboratory-project-logistic-sequences", title: "Laboratory Project: Logistic Sequences" },
      { href: "https://peakd.com/mathematics/@mes/infinite-series-definition-examples-geometric-series-harmonics-series-telescoping-sum-more", title: "Infinite Series: Definition, Examples, Geometric Series, Harmonic Series, Telescoping Sum + MORE", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FfxN_I9trdgSnWtJS-6wK1" },
      { href: "https://peakd.com/mathematics/@mes/infinite-sequences-and-series-the-integral-test-and-estimate-of-sums", title: "The Integral Test and Estimate of Sums", playlistHref: "https://www.youtube.com/playlist?list=PLTXCLnbwZspA" },
      { href: "https://peakd.com/mathematics/@mes/infinite-sequences-and-series-the-comparison-tests", title: "The Comparison Tests" },
      { href: "https://peakd.com/mathematics/@mes/infinite-sequences-and-series-alternating-tests", title: "Alternating Tests" },
      { href: "https://peakd.com/mathematics/@mes/infinite-sequences-and-series-absolute-convergence-and-the-ratio-root-tests", title: "Absolute Convergence and the Ratio/Root Tests" },
      { href: "https://peakd.com/mathematics/@mes/infinite-sequences-and-series-strategy-for-testing-series", title: "Strategy for Testing Series" },
      { href: "https://peakd.com/mathematics/@mes/infinite-sequences-and-series-power-series", title: "Power Series" },
      { href: "https://peakd.com/mathematics/@mes/infinite-sequences-and-series-representations-of-functions-as-power-series", title: "Representations of Functions as Power Series" },
      { href: "https://peakd.com/mathematics/@mes/infinite-sequences-and-series-taylor-and-maclaurin-series", title: "Taylor and Maclaurin Series" },
      { href: "https://peakd.com/@mes/infinite-sequences-and-series-formulas-for-the-remainder-term-in-taylor-series", title: "Formulas for the Remainder Term in Taylor Series" },
      { href: "https://peakd.com/hive-128780/@mes/infinite-sequences-and-series-multiplication-and-division-of-power-series", title: "Multiplication and Division of Power Series" },
      { href: "https://peakd.com/hive-128780/@mes/kummer-s-test-raabe-s-test-and-convergence-of-binomial-series", title: "Kummer's Test, Raabe's Test, and Convergence of Binomial Series" },
      { href: "https://peakd.com/hive-128780/@mes/laboratory-project-an-elusive-limit", title: "Laboratory Project: An Elusive Limit", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0Gzt0ZAIWwnyZr91b7BGoGR" },
      { href: "https://peakd.com/hive-128780/@mes/infinite-sequences-and-series-applications-of-taylor-polynomials", title: "Applications of Taylor Polynomials", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0F76sIU8xm09oqBTq1mlry3" },
      { href: "https://peakd.com/hive-128780/@mes/applied-project-radiation-from-the-stars", title: "Applied Project: Radiation from the Stars (Blackbody Radiation)", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0H9KtXz4yi98pGrnnbSSYUb" },
      { href: "https://peakd.com/hive-128780/@mes/infinite-sequences-and-series-review-and-true-false-quiz", title: "Review and True-False Quiz", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FCqXVJv1r7eJvrvphfkr6L" },
      { href: "https://peakd.com/hive-128780/@mes/infinite-sequences-and-series-problems-plus", title: "Problems Plus", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FQ96Egr5R7fZGeDTIUKz8P" },
    ],
  },
  {
    id: "sphericalHarmonics",
    title: "Spherical Harmonics",
    items: [
      { href: "https://peakd.com/hive-128780/@mes/220d6572", title: "Spherical Harmonics", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FHh2kZzebadnPFwO6Yi5qu" },
    ],
  },
  {
    id: "vectors",
    title: "Vectors and the Geometry of Space",
    playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FjJpwnxwdrOR7L8Ul8VZoZ",
    items: [
      { href: "https://peakd.com/hive-128780/@mes/vector-space-and-geometry-3d-coordinate-systems", title: "3D Coordinates Systems", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0GiAJeLMzhOsrMliibfce5m" },
      { href: "https://peakd.com/hive-128780/@mes/vectors-and-the-geometry-of-space-vectors", title: "Vectors", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EiRECLVkBCcFhSpbSz8XIw" },
      { href: "https://peakd.com/hive-128780/@mes/complex-numbers-as-rotation-matrices", title: "Complex Numbers as Rotation Matrices", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0E6x0dZEAx77Kqv7LLxYdbx" },
      { href: "https://peakd.com/hive-128780/@mes/vectors-and-the-geometry-of-space-the-dot-product", title: "The Dot Product", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0GbHgvpTY1mx61nTNO-Msl8" },
      { href: "https://peakd.com/hive-128780/@mes/vectors-and-the-geometry-of-space-the-cross-product", title: "The Cross Product", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FuRJ8rg-YVQvfPoPOwhuRW" },
      { href: "https://peakd.com/hive-128780/@mes/discovery-project-geometry-of-a-tetrahedron", title: "Laboratory Project: The Geometry of a Tetrahedron", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0GoEi9wxl8nTFcfw1ay-_1T" },
      { href: "https://peakd.com/hive-128780/@mes/equations-of-lines-and-planes", title: "Equations of Lines and Planes", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FO3u0IupqllNNkZTsffpIV" },
      { href: "https://peakd.com/hive-128780/@mes/laboratory-project-putting-3d-in-perspective", title: "Laboratory Project: Putting 3D in Perspective", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0ElsrMs_IBprUoHocIwyAmK" },
      { href: "https://peakd.com/hive-128780/@mes/cylinders-and-quadric-surfaces", title: "Cylinders and Quadric Surfaces", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EfmYwT81SebJnU1Ny8Fc5u" },
      { href: "https://peakd.com/hive-128780/@mes/vectors-and-the-geometry-of-space-review", title: "Review", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0EMiATrjv8HH3fPwKVsgU6P" },
      { href: "https://peakd.com/hive-128780/@mes/vectors-geometry-true-false-quiz", title: "True-False Quiz", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0GiYS2qR98dzUjsx-0PRPbC" },
      { href: "https://peakd.com/hive-128780/@mes/jlgigkdl", title: "Problems Plus", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0G_7Jd6ZORHFQMk8jbwmkos" },
    ],
  },
  {
    id: "vectorfunctions",
    title: "Vector Functions",
    playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0HQl7xTQBS_O8Te8PcpNm4U",
    items: [
      { href: "https://peakd.com/hive-128780/@mes/omhbcxkw", title: "Vector Functions and Space Curves", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0GwdMY-E9_4LsmYmO-IxcoX" },
      { href: "https://peakd.com/hive-128780/@mes/hfsetrue", title: "Derivatives and Integrals of Vector Functions", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FgQ3jBd9IFaWOakOWbHous" },
      { href: "https://peakd.com/hive-128780/@mes/koxharrd", title: "Arc Length and Curvature", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0Gd5OieYiZMaSKw1QfyHbiG" },
      { href: "https://peakd.com/hive-128780/@mes/e443f9d3", title: "Motion in Space: Velocity and Acceleration", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0Hxo8aPU3ezG0tcLvgJnxLB" },
      { href: "https://peakd.com/hive-128780/@mes/c3b94a80", title: "Applied Project: Kepler's Laws of Planetary Motion", playlistHref: "https://www.youtube.com/playlist?list=PLai3U8-WIK0FSh63mgXOKLQ41H4dkzbaY" },
      { href: "https://peakd.com/hive-128780/@mes/review-of-vector-functions-138", title: "Review: Concept Check & True-False Quiz", playlistHref: "https://www.youtube.com/playlist?list=PLAsz0y2lc-c4" },
      { href: "https://mes.fm/vector-functions-problems-plus", title: "Problems Plus", playlistHref: "https://www.youtube.com/playlist?list=PLHNdnBXVWSlo" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scraping: og:image / "Watch on: ..." row per item, with a committed cache.
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
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  writeFileSync(META_CACHE_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, "’")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Backreference-matched quotes (not a naive ["'] class) so a content value
// containing the *other* quote character doesn't truncate the match.
function readMetaTag(html, prop) {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = html.match(new RegExp(`<meta[^>]+property=(["'])${p}\\1[^>]*\\bcontent=(["'])([\\s\\S]*?)\\2`, "i"));
  return m ? decodeEntities(m[3]).trim() : "";
}

// Pull every {label, href} pair out of a page's own `<li>Watch on: <a...>3Speak</a>
// &middot; <a...>YouTube</a> ...</li>` source-list row. Only mes.fm-hosted
// mirror pages have this markup -- a peakd/Hive article or a raw YouTube
// playlist page will simply yield [] here, which is expected.
function readWatchOnLinks(html) {
  const m = html.match(/<li>\s*Watch on:([\s\S]*?)<\/li>/i);
  if (!m) return [];
  const linkRe = /<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  const links = [];
  let lm;
  while ((lm = linkRe.exec(m[1]))) {
    links.push({ label: decodeEntities(lm[2]).trim(), href: lm[1] });
  }
  return links;
}

async function fetchLinkMeta(url) {
  const res = await fetch(url, { headers: { "User-Agent": "mes.fm-build/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return {
    image: readMetaTag(html, "og:image"),
    watchLinks: readWatchOnLinks(html),
  };
}

async function resolveAllMeta(sections, concurrency = 8) {
  const cache = loadMetaCache();
  const urls = sections.flatMap((s) => s.items.map((i) => i.href));
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        cache[url] = await fetchLinkMeta(url);
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

// Watch-on links are sorted to this canonical platform order (whichever the
// item actually has); anything scraped that isn't in this list (an "etc.")
// is kept, appended after the recognized ones in its original order.
const PLATFORM_ORDER = ["3Speak", "YouTube", "Telegram", "BitChute", "Odysee", "Rumble"];
function sortWatchLinks(links) {
  const known = PLATFORM_ORDER.map((label) => links.find((l) => l.label === label)).filter(Boolean);
  const rest = links.filter((l) => !PLATFORM_ORDER.includes(l.label));
  return [...known, ...rest];
}

function cssSafeUrl(url) {
  return String(url).split("'").join("%27");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Notes link first, then every scraped platform link (sorted), falling back
// to the item's own hand-curated playlistHref as its "YouTube" entry only
// when the scrape didn't already turn up a YouTube link of its own.
function buildLinksForItem(item, meta) {
  const m = meta[item.href] || {};
  const scraped = m.watchLinks || [];
  const hasYoutube = scraped.some((l) => l.label === "YouTube");
  const extra = !hasYoutube && item.playlistHref ? [{ label: "YouTube", href: item.playlistHref }] : [];
  const combined = sortWatchLinks([...scraped, ...extra]);
  return [{ label: "Notes", href: item.href }, ...combined];
}

function buildCard(item, meta) {
  const m = meta[item.href] || {};
  const thumbStyle = m.image ? ` style="background-image:url('${cssSafeUrl(escapeHtml(m.image))}')"` : "";
  return `<a class="link-card" href="${escapeHtml(item.href)}">
      <span class="link-card-thumb"${thumbStyle}></span>
      <span class="link-card-body">
        <span class="link-card-title">${escapeHtml(item.title)}</span>
        <span class="link-card-readmore">View &rarr;</span>
      </span>
    </a>`;
}

function buildRow(item, meta) {
  const m = meta[item.href] || {};
  const links = buildLinksForItem(item, meta);
  const linksHtml = links
    .map((l) => `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`)
    .join(" - ");
  const imgHtml = m.image ? `<img class="list-thumb" src="${escapeHtml(m.image)}" alt="">` : "";
  return `<div class="list-row">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${linksHtml}</p>
      ${imgHtml}
    </div>`;
}

// Renders one section's heading row + Grid View (default) / List View toggle.
// Both views are pre-rendered at build time; the client-side script just
// shows/hides which one is visible (see the view-toggle script at the bottom
// of buildPage).
function buildSection(section, meta) {
  const playlistLink = section.playlistHref
    ? ` <a href="${escapeHtml(section.playlistHref)}">&#9654;&#65039;</a>`
    : "";
  const cards = section.items.map((item) => buildCard(item, meta)).join("\n    ");
  const rows = section.items.map((item) => buildRow(item, meta)).join("\n    ");

  return `<div class="list-container">
  <h2 id="${section.id}-heading" class="sub-heading" onclick="toggleSubList('${section.id}')">${escapeHtml(section.title)}${playlistLink} <span id="arrowIcon-${section.id}" class="arrow-icon" style="font-size: 75%;">&#9660;</span></h2>
  <div id="${section.id}" class="section-body collapsible">
    <div class="view-toggle">
      <button type="button" class="view-toggle-btn active" id="${section.id}GridBtn">Grid View</button>
      <button type="button" class="view-toggle-btn" id="${section.id}ListBtn">List View</button>
    </div>
    <div class="card-grid" id="${section.id}Grid">
    ${cards}
    </div>
    <div class="list-view view-hidden" id="${section.id}List">
    ${rows}
    </div>
  </div>
</div>`;
}

function buildPage(meta) {
  const sectionsHtml = SECTIONS.map((s) => buildSection(s, meta)).join("\n\n");
  const viewToggleWiring = SECTIONS.map(
    (s) => `      wireViewToggle('${s.id}');`
  ).join("\n");

  return `
<!DOCTYPE html>
<html>
<head>
  <link rel="canonical" href="${CANONICAL}" />
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="MES Math Tutorials - Free math video/article tutorials on infinite sequences and series, vectors and the geometry of space, vector functions, spherical harmonics, and more.">
  <meta name="keywords" content="MES, Math, Tutorials, Math Easy Solutions, Calculus">
  <meta name="author" content="Mathiew Estepho">
  <link rel="icon" href="https://mes.fm/img/favicon.ico?v=1.0" type="image/x-icon" />
  <title>MES Math Tutorials</title>
  <style>
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1em;
      max-width: 1180px;
      margin: 0.6em auto 0;
    }

    /* Logo mark + title, proportioned like mes.fm/percentagecalculator's own
       header (88px logo, 1.8em title, side-by-side) instead of a plain
       oversized <h1>. */
    .page-header-brand {
      display: flex;
      align-items: center;
      gap: 1.2em;
      text-decoration: none;
    }

    .page-logo {
      display: block;
      border-radius: 0.35em;
      flex: 0 0 auto;
    }

    .page-header-title {
      font-size: 1.8em;
      font-weight: 700;
    }

    body.light .page-header-title { color: #000000; }
    body.dark .page-header-title { color: #ffffff; }

    .chapters-toolbar {
      display: flex;
      justify-content: flex-end;
      max-width: 1180px;
      margin: 0.6em auto 0;
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

    .list-container {
      max-width: 1180px;
      margin: 0 auto 1.5em;
    }

    .sub-heading {
      font-size: 1.1em;
      cursor: pointer;
    }

    /* Wide topic-card-grid treatment (mes.fm homepage / mes.fm/911 pattern),
       here with real scraped thumbnails and a Grid View / List View toggle
       per section -- same architecture as
       mes.fm/vector-functions-problems-plus/build.mjs, widened for this
       page's .wide band: up to 5 cards/row (vs. that page's fixed 3), and up
       to 2 full-thumbnail rows/row in List View on wide screens (vs. 1). */
    .view-toggle {
      display: flex;
      gap: 0.5em;
      margin: 0.6em 0 0.8em;
    }

    .view-toggle-btn {
      padding: 5px 10px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85em;
    }

    body.light .view-toggle-btn { background-color: #dddddd; color: #000000; }
    body.dark .view-toggle-btn { background-color: #444444; color: #ffffff; }
    body.light .view-toggle-btn.active { background-color: #1a6fb0; color: #ffffff; }
    body.dark .view-toggle-btn.active { background-color: #6cb6f5; color: #1a1a1a; }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 0.9rem;
      margin: 0 0 0.4em;
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
      font-size: 0.9rem;
      font-weight: 700;
      line-height: 1.3;
      color: inherit;
    }

    .link-card-readmore {
      font-size: 0.78rem;
      font-weight: 600;
    }

    body.light .link-card-readmore { color: #1a6fb0; }
    body.dark .link-card-readmore { color: #6cb6f5; }

    /* List View -- title / links row / full (uncropped) thumbnail per item,
       1 column by default, 2 side-by-side once the wide band has room. */
    .list-view {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0 2em;
    }

    @media (min-width: 900px) {
      .list-view {
        grid-template-columns: 1fr 1fr;
      }
    }

    .list-row h3 {
      font-size: 1.05em;
      margin: 0 0 0.3em;
    }

    .list-row p {
      margin: 0 0 0.6em;
    }

    .list-thumb {
      display: block;
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 0 0 1.4em;
      cursor: zoom-in;
    }

    /* Must come after .card-grid/.list-view above: same specificity (single
       class), so source order decides the tie -- this needs to win. */
    .view-hidden {
      display: none;
    }

    @media screen and (max-width: 600px) {
      .page-header-title {
        font-size: 1.4em;
      }
      .page-header {
        flex-direction: column;
        align-items: flex-start;
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

    /* Full-viewport image lightbox for List View thumbnails -- click to
       zoom, prev/next via on-screen arrows or keyboard, same pattern used
       across the repo (e.g. mes.fm/vector-functions-problems-plus). */
    .lightbox-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.96);
      z-index: 2147483647;
      align-items: center;
      justify-content: center;
      padding-bottom: 120px;
    }

    .lightbox-overlay.open { display: flex; }

    .lightbox-image {
      width: 100vw;
      max-width: 100vw;
      max-height: calc(100vh - 120px);
      object-fit: contain;
      display: block;
    }

    .lightbox-controls {
      position: fixed;
      left: 50%;
      bottom: 40px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .lightbox-counter {
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      font-size: 0.85em;
      padding: 5px 12px;
      border-radius: 999px;
    }

    .lightbox-close,
    .lightbox-prev,
    .lightbox-next {
      position: fixed;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      border: 0;
      cursor: pointer;
    }

    .lightbox-close:hover,
    .lightbox-prev:hover,
    .lightbox-next:hover { background: rgba(0, 0, 0, 0.85); }

    .lightbox-close {
      top: 16px;
      right: 16px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 1.3em;
      z-index: 2147483647;
    }

    .lightbox-prev,
    .lightbox-next {
      position: static;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      font-size: 1.4em;
    }

    @media (max-width: 600px) {
      .lightbox-overlay { padding-bottom: 100px; }
      .lightbox-image { max-height: calc(100vh - 100px); }
      .lightbox-controls { bottom: 32px; }
      .lightbox-prev, .lightbox-next { width: 38px; height: 38px; font-size: 1.2em; }
      .lightbox-close { width: 36px; height: 36px; }
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
    <span class="back-link">&larr; <a href="https://mes.fm">mes.fm</a> &middot; <a href="https://mes.fm/links">MES Links</a></span>
  </div>

  <header class="page-header">
    <a class="page-header-brand" href="${CANONICAL}">
      <img src="https://mes.fm/img/logo-mark.png" width="88" height="88" alt="MES Math Tutorials logo" class="page-logo">
      <span class="page-header-title">MES Math Tutorials</span>
    </a>
    <button id="themeToggle" class="theme-toggle-btn">Loading...</button>
  </header>

  <div class="chapters-toolbar">
    <button id="toggleAllListsBtn" class="theme-toggle-btn toggle-all-lists-btn" onclick="toggleAllLists()">Collapse All</button>
  </div>

${sectionsHtml}

  <script>
    function toggleAllLists() {
      const lists = document.querySelectorAll('.collapsible');
      const buttons = document.querySelectorAll('.toggle-all-lists-btn');
      const collapse = lists.length === 0 || !lists[0].classList.contains('hidden');
      lists.forEach((list) => {
        list.classList.toggle('hidden', collapse);
        const arrowIcon = document.getElementById('arrowIcon-' + list.id);
        if (arrowIcon) arrowIcon.textContent = collapse ? '▼' : '▲';
      });
      buttons.forEach((btn) => { btn.textContent = collapse ? 'Expand All' : 'Collapse All'; });
    }

    function toggleSubList(listId) {
      const list = document.getElementById(listId);
      const arrowIcon = document.getElementById(\`arrowIcon-\${listId}\`);
      list.classList.toggle('hidden');
      arrowIcon.textContent = list.classList.contains('hidden') ? '▼' : '▲';
    }
  </script>

  <script>
    // view-toggle: switches a section between Grid View (thumbnail cards,
    // default) and List View (title + full thumbnail + platform links) --
    // both are pre-rendered at build time in buildSection(), this just
    // toggles which one is visible. One wiring call per section (see
    // buildPage()'s viewToggleWiring).
    function wireViewToggle(id) {
      var gridBtn = document.getElementById(id + 'GridBtn');
      var listBtn = document.getElementById(id + 'ListBtn');
      var grid = document.getElementById(id + 'Grid');
      var list = document.getElementById(id + 'List');
      if (!gridBtn || !listBtn || !grid || !list) return;

      gridBtn.addEventListener('click', function () {
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
        grid.classList.remove('view-hidden');
        list.classList.add('view-hidden');
      });
      listBtn.addEventListener('click', function () {
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
        list.classList.remove('view-hidden');
        grid.classList.add('view-hidden');
      });
    }

${viewToggleWiring}
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

  <div class="lightbox-overlay" id="lightboxOverlay" role="dialog" aria-modal="true" aria-label="Image viewer">
    <button class="lightbox-close" id="lightboxClose" type="button" aria-label="Close image viewer">&times;</button>
    <img class="lightbox-image" id="lightboxImage" src="" alt="">
    <div class="lightbox-controls" id="lightboxControls">
      <button class="lightbox-prev" id="lightboxPrev" type="button" aria-label="Previous image">&#8249;</button>
      <div class="lightbox-counter" id="lightboxCounter"></div>
      <button class="lightbox-next" id="lightboxNext" type="button" aria-label="Next image">&#8250;</button>
    </div>
  </div>

  <script>
    // image-lightbox: click any List View thumbnail to pop it out
    // full-viewport, with prev/next via on-screen arrows and keyboard arrows.
    (function () {
      var images = Array.prototype.slice.call(document.querySelectorAll('.list-thumb'));
      if (!images.length) return;

      var overlay = document.getElementById('lightboxOverlay');
      var imageEl = document.getElementById('lightboxImage');
      var controlsEl = document.getElementById('lightboxControls');
      var counterEl = document.getElementById('lightboxCounter');
      var closeBtn = document.getElementById('lightboxClose');
      var prevBtn = document.getElementById('lightboxPrev');
      var nextBtn = document.getElementById('lightboxNext');
      var currentIndex = 0;

      if (images.length < 2) {
        controlsEl.style.display = 'none';
      }

      function show(index) {
        currentIndex = (index + images.length) % images.length;
        var img = images[currentIndex];
        imageEl.src = img.currentSrc || img.src;
        imageEl.alt = img.alt || '';
        counterEl.textContent = (currentIndex + 1) + ' / ' + images.length;
      }

      function open(index) {
        show(index);
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
      }

      function close() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
      }

      images.forEach(function (img, index) {
        img.addEventListener('click', function () { open(index); });
      });

      closeBtn.addEventListener('click', close);
      prevBtn.addEventListener('click', function () { show(currentIndex - 1); });
      nextBtn.addEventListener('click', function () { show(currentIndex + 1); });

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });

      document.addEventListener('keydown', function (e) {
        if (!overlay.classList.contains('open')) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') show(currentIndex - 1);
        else if (e.key === 'ArrowRight') show(currentIndex + 1);
      });
    })();
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
  console.log(`Resolving link metadata for ${SECTIONS.flatMap((s) => s.items).length} items ...`);
  const meta = await resolveAllMeta(SECTIONS);

  const html = buildPage(meta);
  const outPath = join(__dirname, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
