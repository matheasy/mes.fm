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
    compactList: true,
    // A third view (its own toggle button, alongside Grid View/List View)
    // for stats-screen pages that don't belong as a regular episode entry --
    // never rendered in Grid/List, only in its own compact double-thumbnail
    // pane. See extraViews handling in buildSection()/buildPage().
    extraViews: [
      {
        id: "stats",
        label: "Stats",
        items: [{ href: "https://mes.fm/math-qa-71-stats", title: "71: Stats" }],
      },
    ],
    items: [
      { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0F1GgkU63uA9NIncxDS2q0-", title: "Playlist", standalone: true },
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
// mirror pages have this markup -- a raw YouTube playlist page will simply
// yield [] here, which is expected.
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

// Some mes.fm mirror pages (e.g. math-qa-71-stats, a plain stats-screen
// post with no "Watch on:" video row at all) instead carry a source link
// per line: `<li>Hive: <a href="...">...</a></li>`, `<li>Telegram:
// <a href="...">...</a></li>`. Pulled out generically here; callers filter
// to whichever labels they care about.
function readNamedLinks(html) {
  const re = /<li>\s*([A-Za-z ]+):\s*<a\s+href="([^"]+)"[^>]*>[^<]*<\/a>\s*<\/li>/g;
  const links = [];
  let m;
  while ((m = re.exec(html))) {
    links.push({ label: m[1].trim(), href: m[2] });
  }
  return links;
}

// peakd.com is a client-rendered SPA -- a plain fetch() only gets its
// server-rendered <head> (og:image etc.), never the article body, so
// readWatchOnLinks() above always finds nothing there. The real per-video
// platform links still exist, in the underlying Hive post's raw markdown
// (e.g. "[Watch on 3Speak](url) - [YouTube](url) - [Odysee](url) - ..."),
// fetched straight from the Hive blockchain instead of peakd's own HTML.
const PEAKD_URL_RE = /^https:\/\/peakd\.com\/(?:[^/]+\/)?@([^/]+)\/([^/?#]+)/;

// Known video platforms -- used both to sort a List View row's links into
// this canonical order and, below, to filter a Hive post's raw "Watch on"
// markdown line down to just these (dropping trailing "[PDF notes]"/
// "[Playlist]"/"[MES Links]" entries on the same line).
const PLATFORM_ORDER = ["3Speak", "YouTube", "Telegram", "BitChute", "Odysee", "Rumble"];

async function hiveCall(method, params) {
  const res = await fetch("https://api.hive.blog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  if (!res.ok) throw new Error(`Hive API request failed: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Hive API error: ${JSON.stringify(data.error)}`);
  return data.result;
}

// Matches "[Watch on 3Speak](url) - [YouTube](url) - [Odysee](url) - ..."
// (MES's standard markdown watch-links line). The label of the first link
// carries a "Watch on " prefix; every [label](url) pair in the next 900
// characters is a candidate, filtered down to only the known video
// platforms so trailing "[PDF notes]"/"[Playlist]"/"[MES Links]" entries on
// the same line are dropped. A fixed (not paragraph-bounded) window: the
// full line with every platform plus the PDF/playlist/MES-links extras can
// run past 700 characters, and anchoring the end to the paragraph's "\n\n"
// with a *lazy* quantifier made the whole match fail outright whenever that
// boundary sat beyond the capped length (no shorter position satisfies it,
// so the lazy expansion just runs out and backtracks to no match).
function readWatchOnLinksMarkdown(markdown) {
  const m = markdown.match(/\[Watch on ([^\]]+)\]\(([^)]+)\)([\s\S]{0,900})/i);
  if (!m) return [];
  const links = [{ label: m[1].trim(), href: m[2] }];
  const restRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let rm;
  while ((rm = restRe.exec(m[3]))) {
    links.push({ label: rm[1].trim(), href: rm[2] });
  }
  return links.filter((l) => PLATFORM_ORDER.includes(l.label));
}

async function fetchPeakdWatchLinks(url) {
  const m = url.match(PEAKD_URL_RE);
  if (!m) return [];
  const [, author, permlink] = m;
  const post = await hiveCall("bridge.get_post", { author, permlink });
  if (!post || !post.body) return [];
  return readWatchOnLinksMarkdown(post.body);
}

async function fetchLinkMeta(url) {
  const res = await fetch(url, { headers: { "User-Agent": "mes.fm-build/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const watchLinks = PEAKD_URL_RE.test(url) ? await fetchPeakdWatchLinks(url) : readWatchOnLinks(html);
  return {
    image: readMetaTag(html, "og:image"),
    watchLinks,
    namedLinks: readNamedLinks(html),
  };
}

async function resolveAllMeta(sections, concurrency = 8) {
  const cache = loadMetaCache();
  const urls = sections.flatMap((s) =>
    s.items.map((i) => i.href).concat((s.extraViews || []).flatMap((v) => v.items.map((i) => i.href)))
  );
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

// Only these platforms, in this order -- anything else scraped (e.g.
// math-qa-70-lorentz-force's own "Watch on:" row also lists Twitch) is
// dropped rather than tacked on at the end.
function sortWatchLinks(links) {
  return PLATFORM_ORDER.map((label) => links.find((l) => l.label === label)).filter(Boolean);
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
// Notes link first, then every real per-video platform link the item's own
// Hive post actually has (scraped by fetchLinkMeta -- from the page's own
// "Watch on:" HTML row for a mes.fm mirror, or from the underlying Hive
// post's raw markdown for a peakd article). No more falling back to a
// hand-curated playlist link mislabeled as "YouTube" -- if the post has no
// watch-on row, the List View row just shows Notes alone.
function buildLinksForItem(item, meta) {
  const m = meta[item.href] || {};
  const sorted = sortWatchLinks(m.watchLinks || []);
  return [{ label: "Notes", href: item.href }, ...sorted];
}

// For extraViews items (see e.g. MES Math Q/A Livestreams' "Stats" view):
// these are always mes.fm-hosted pages, so the item's own link is labeled
// "MES" rather than "Notes", followed by whichever of its own named source
// links (readNamedLinks -- "Hive:"/"Telegram:" list items, not a "Watch
// on:" row) match this fixed label set, in this fixed order.
const EXTRA_VIEW_LINK_ORDER = ["Hive", "Telegram"];
function buildExtraViewLinksForItem(item, meta) {
  const m = meta[item.href] || {};
  const named = EXTRA_VIEW_LINK_ORDER.map((label) => (m.namedLinks || []).find((l) => l.label === label)).filter(
    Boolean
  );
  return [{ label: "MES", href: item.href }, ...named];
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

function buildRow(item, meta, linksBuilder) {
  const m = meta[item.href] || {};
  const links = (linksBuilder || buildLinksForItem)(item, meta);
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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Renders one section's heading row + Grid View (default) / List View toggle,
// plus any extraViews (see e.g. MES Math Q/A Livestreams' "Stats" view) as
// further toggle buttons/panes. All views are pre-rendered at build time;
// the client-side script just shows/hides whichever one is active (see the
// view-toggle script at the bottom of buildPage). Items flagged `standalone`
// (a whole-channel/whole-playlist link, not a single video/article) are
// pulled out of the grid/list entirely and rendered as a plain link line
// above the view-toggle buttons instead. extraViews items never appear in
// Grid/List at all -- they exist only in their own pane.
function buildSection(section, meta) {
  const playlistLink = section.playlistHref
    ? ` <a href="${escapeHtml(section.playlistHref)}">&#9654;&#65039;</a>`
    : "";
  const standaloneItems = section.items.filter((item) => item.standalone);
  const cardItems = section.items.filter((item) => !item.standalone);
  const standaloneHtml = standaloneItems
    .map((item) => `<p class="section-standalone-link"><a href="${escapeHtml(item.href)}">&#9654;&#65039; ${escapeHtml(item.title)}</a></p>`)
    .join("\n  ");
  const cards = cardItems.map((item) => buildCard(item, meta)).join("\n    ");
  const rows = cardItems.map((item) => buildRow(item, meta)).join("\n    ");
  const listViewClass = section.compactList ? "list-view list-view--compact" : "list-view";

  const extraViews = section.extraViews || [];
  const extraButtons = extraViews
    .map((view) => `<button type="button" class="view-toggle-btn" id="${section.id}${capitalize(view.id)}Btn">${escapeHtml(view.label)}</button>`)
    .join("\n      ");
  const extraPanes = extraViews
    .map((view) => {
      const extraRows = view.items.map((item) => buildRow(item, meta, buildExtraViewLinksForItem)).join("\n    ");
      return `<div class="list-view list-view--compact view-hidden" id="${section.id}${capitalize(view.id)}">
    ${extraRows}
    </div>`;
    })
    .join("\n");

  return `<div class="list-container">
  <h2 id="${section.id}-heading" class="sub-heading" onclick="toggleSubList('${section.id}')">${escapeHtml(section.title)}${playlistLink} <span id="arrowIcon-${section.id}" class="arrow-icon" style="font-size: 75%;">&#9660;</span></h2>
  <div id="${section.id}" class="section-body collapsible">
  ${standaloneHtml}
    <div class="view-toggle">
      <button type="button" class="view-toggle-btn active" id="${section.id}GridBtn">Grid View</button>
      <button type="button" class="view-toggle-btn" id="${section.id}ListBtn">List View</button>
      ${extraButtons}
    </div>
    <div class="card-grid" id="${section.id}Grid">
    ${cards}
    </div>
    <div class="${listViewClass} view-hidden" id="${section.id}List">
    ${rows}
    </div>
${extraPanes}
  </div>
</div>`;
}

function buildPage(meta) {
  const sectionsHtml = SECTIONS.map((s) => buildSection(s, meta)).join("\n\n");
  const viewToggleWiring = SECTIONS.map((s) => {
    const extraIds = (s.extraViews || []).map((v) => capitalize(v.id));
    return `      wireViewToggle('${s.id}', ${JSON.stringify(extraIds)});`;
  }).join("\n");
  const tocLinksHtml = SECTIONS.map(
    (s) => `<a href="#${s.id}-heading">${escapeHtml(s.title)}</a>`
  ).join("\n  ");

  return `
<!DOCTYPE html>
<html lang="en">
<!-- Added by HTTrack --><meta http-equiv="content-type" content="text/html;charset=UTF-8" /><!-- /Added by HTTrack -->
<head>
  <link rel="icon" href="https://mes.fm/img/favicon.ico?v=1.0" type="image/x-icon" />
  <link rel="canonical" href="${CANONICAL}" />
  <title>Math Tutorials | Math Easy Solutions</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code,del, dfn, em, img,
ins, kbd, q, s, samp, small, strike, strong, sub, tt, var, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, table, caption, tbody,
tfoot, thead, tr, th, td, article, aside, canvas, details, embed, figure, figcaption, footer, header, hgroup, menu, nav, output, ruby, section, summary,
time, mark, audio, video {margin:0;padding:0;border:0;font-size:100%;font-family:Helvetica,Arial,Optima,Sans Pro;vertical-align:baseline;color:#333333;}
sup {margin:0;padding:0;border:0;font-size:100%;font-family:Helvetica,Arial,Optima,Sans Pro;vertical-align:super;color:black;}
b {margin:0;padding:0;border:0;font-size:100%;font-family:Helvetica,Arial,Optima,Sans Pro;vertical-align:baseline;}
/* HTML5 display-role reset for older browsers */
article, aside, details, figcaption, figure, footer, header, hgroup, menu, nav, section {display:block;}
body {background-color:#e2e2e2;line-height:1;}
ol, ul {list-style:none;}
blockquote, q {quotes:none;}
blockquote:before, blockquote:after,
q:before, q:after {content:'';content:none;}
table {border-collapse:collapse;border-spacing:0;}
a {text-decoration:none;}
sub {vertical-align:sub;}
.hide {display:none;}

.shadow {box-shadow:0.2em 0.2em 0.5em #999999;}
.link:hover {color:#346689;text-decoration:underline; cursor:pointer;}

.outer-container {width:68.25em;margin:0 auto;}
.inner-container {padding:1em 2em 1em 2em;overflow:hidden;background-color:white;box-shadow:0 0 1em #BBBBBB;}
.header {position:relative;margin-bottom: 0.7em;}
.logo-image-container {display:table-cell;}
.logo {display:block;}
.logo-text-container {display:table-cell;vertical-align:middle;padding-left:1.5em;}
.calculator-title-link {display: block;}
.calculator-title {margin-bottom:0.3em;font-size:1.8em;}
.tag-line {font-size:1.2em;}

.social-container {position:absolute;right:0;top:0;}
.social-container--bottom {position:absolute;right:0;bottom:0;}
.social {display: table-cell;}
.social__text {display:table-cell;font-size:1.2em;vertical-align:middle;padding-right:0.6em;font-style:italic;color:#277bb6;}
.social__text {display:block;margin-bottom:0.5em;}
.social__logo {float:left;}
.social__logo:not(:last-child) {margin-right:0.5em;}
.social__link {height:2em;width:2em;display:block;}
.social__fb {background: url(/main_img/social-sprites.png) 0 0;}
.social__gplus {background: url(/main_img/social-sprites.png) -2em 0;}
.social__insta {background: url(/main_img/social-sprites.png) -4em 0;}
.social__pin {background: url(/main_img/social-sprites.png) -6em 0;}
.social__twitter {background: url(/main_img/social-sprites.png) -8em 0;}
.social__yt {background: url(/main_img/social-sprites.png) -10em 0;}
.social__patreon {background: url(/main_img/social-sprites.png) -12em 0;}
.social__steemit {background: url(/main_img/social-sprites.png) -14em 0;}
.social__hive {background: url(/main_img/social-sprites.png) -16em 0;}
.social__telegram {background: url(/main_img/social-sprites.png) -18em 0;}
.info-bar-container {display: table-cell;}
.info-bar {display:inline-block;margin-left:-2em;padding-left:1.1em;overflow:hidden;}
.info-bar__item {float:left;}
.info-bar__item__text {display:block;text-align:center;padding:0.7em 1em 0.7em 1em;font-size:0.9em;color:white}
.info-bar__logo-container {display: table-cell;vertical-align: middle;}
.info-bar__logo {display: block; margin-left: 0.8em;}

.outer-page-content {width:45.5em;display:inline-block;}
.page-content {padding:1.2em 2.25em 0 0;}
.color-box {width:1.2em;height:1.2em;display:inline-block;margin-right:0.5em;}
.page-title {display:inline-block;font-size:1.5em;font-weight:100;margin-bottom:0.3em;}
.page-description {line-height:1.3;}
#main-content {margin:1.5em 0;position:relative;}

.side-bar {width:18.75em;float:right;}
.navbar-container {margin:2.1em 0.8em;}
.navbar {margin-bottom:-1em;}
.button--navbar {padding:0.7em 0.2em;font-size:1.2em;margin-bottom:0;color:#277bb6;border:0.125em solid #277bb6;}

.navbar__item:hover {cursor:pointer;}
.navbar__link  {display:block;color:white;padding:0.7em 1em 0.7em 1.4em;}
.navbar__link--first {padding-top:0.8em;}
.navbar__dropdown-item {color:#222222;}
.navbar__dropdown-item:hover {text-decoration:underline;}
.dropdown-symbol {margin-left:1em;color:white;}

.footer {padding:2em;}
.footer__item-container {display:table;width:100%;margin-bottom:1.6em;}
.footer__item {display:table-cell;}
.footer__item--extra-padding {padding-left:2.5em;}
.footer__text {color:white;line-height:1.5;}
.footer__text--title {display:inline-block;margin-bottom:1.6em;font-size:1.3em;font-style:italic;}
.footer__text--extra-info {float:right;}
.footer__text:not(.footer__text--copyright):hover {text-decoration:underline; cursor:pointer;}
.footer__text--black {color:#000;}
.footer__separator {color:white;}
#copyright-year {color:white;}

.active-tab {background-color: #eef0ff;color: #222222;}
.navbar__link:hover:not(.navbar__dropdown-item):not(.active-tab),.info-bar__item__text:hover:not(.active-tab) {background-color: #346689;}

.info-bar,.color-box,.navbar,.footer {background-color:#277bb6;}
.dropdown-symbol--dark {color:#277bb6;}
.button--active {background-color:#277bb6;color:white;}
.navbar__dropdown-container {color: #222222;background-color:#eef0ff;}
.logo {height:88px;width:88px;border-radius:0.35em;}
.tag-line {font-size:1.2em;}
.info-bar__logo-container {display: none;}
/* RESPONSIVE-FIX-INSERTED */
@media (max-width: 768px) {
  .outer-container { width: 100% !important; margin: 0 !important; }
  .outer-page-content { width: 100% !important; display: block !important; }
  .side-bar { width: 100% !important; float: none !important; }
  .page-box { width: auto !important; display: block !important; margin: 0 auto 0.5em auto !important; }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  .header { position: static !important; }
  .logo-image-container, .logo-text-container, .social-container, .social-container--bottom { display: block !important; position: static !important; width: 100% !important; text-align: center !important; margin: 0 auto 0.5em auto !important; }
  .social-container ul.social, .social__text { display: block !important; margin: 0 auto 0.3em auto !important; }
  .social__logo { display: inline-block !important; float: none !important; }
  .info-bar-container { display: block !important; width: 100% !important; text-align: center !important; }
  .info-bar__logo-container { display: none !important; }
  .info-bar { margin-left: 0 !important; padding-left: 0 !important; display: block !important; }
  .info-bar__item { float: none !important; display: inline-block !important; }
}

/* hamburger nav: reuses the existing #navbar-button/#navbar show/hide
   (already wired up in main.js) -- CSS-only hamburger icon + dropdown
   panel instead of the always-visible sidebar, at every screen width
   (not just mobile), so no page reserves a right-hand column for it */
.inner-container { position: relative !important; }
.header .social-container { display: none !important; }
.side-bar { width: auto !important; float: none !important; }
.navbar-container { margin: 0 !important; box-shadow: none !important; }
.navbar__item--social { display: list-item; padding: 1em 1.6em 1em 1.4em; border-bottom: 1px solid rgba(255,255,255,0.25); }
.navbar__item--social .social-container--navbar { position: static !important; display: flex; flex-wrap: wrap; align-items: center; gap: 0.6em; }
.navbar__item--social .social__text { color: white; margin: 0; }
.navbar__item--social .social { display: flex; flex-wrap: wrap; gap: 0.5em; margin: 0; padding: 0; }
#navbar-button {
  position: absolute !important; top: 16px !important; right: 16px !important; z-index: 20;
  width: 44px; height: 44px; padding: 0; margin: 0 !important;
  background: transparent !important; border: none !important;
  font-size: 0;
}

@media (max-width: 768px) {
  .header { padding-right: 4em !important; box-sizing: border-box; }
}
#navbar-button::before {
  content: ""; display: block; margin: 0 auto;
  width: 26px; height: 4px; background: currentColor; border-radius: 1px;
  box-shadow: 0 7px 0 currentColor, 0 -7px 0 currentColor;
}
#navbar { display: none; }
#navbar.hide {
  display: block; box-sizing: border-box;
  position: absolute; top: 76px; right: 16px; z-index: 19;
  width: 16em; max-width: 90vw; max-height: 75vh; overflow-y: auto;
  scrollbar-gutter: stable;
  box-shadow: 0 0.25em 1em rgba(0,0,0,0.3);
  border-radius: 0.25em;
}
#navbar.hide { display: flex; flex-direction: column; }
.navbar__item--social { order: 999; }
.navbar__item--social .info-bar__logo-container { display: block !important; }

/* Math Tutorials needs more width than the site's default narrowed
   centered column (the calculators.html-style pages cap at 50em once
   their sidebar becomes a hamburger) -- same widening mes.fm/index.html
   itself got (50em -> 75em) so the card grid below has room for 4-5
   columns. */
.outer-container { width: auto !important; max-width: 75em; margin: 0 auto !important; }
.outer-page-content { width: 100% !important; display: block !important; }
.page-content { padding-right: 0 !important; }
@media (max-width: 600px) {
  .footer { padding: 1.25em 0.75em; }
  .footer__item-container { display: block; }
  .footer__item { display: block; margin-bottom: 0.75em; }
  .footer__item--extra-padding { padding-left: 0; }
  .footer__text--extra-info { float: none; display: block; margin-top: 0.5em; }

  .inner-container { padding: 1em 0.75em; }
  .page-content { padding-right: 0; }

  .info-bar__item__text { min-height: 44px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
}

/* Page content -- wide topic-card grid with a Grid View / List View toggle
   per section, same architecture as
   mes.fm/vector-functions-problems-plus/build.mjs: up to 5 cards/row in
   Grid View, up to 2 full-thumbnail rows/row in List View on wide screens. */
.wide {
  max-width: 75em;
  margin: 0 auto;
}

.list-container {
  margin: 0 0 1.5em;
}

/* Centered like mes.fm/hutchison's own chapter titles (.wide
   .chapter-toggle-header{text-align:center}) -- but, matching that same
   page, only this section-level heading is centered. The standalone
   playlist link, view-toggle buttons, and each item's own title/links
   inside List View stay left-aligned, same as hutchison's per-entry
   markdown headings/link rows -- only the thumbnail image is centered
   there (via margin:auto on .list-thumb, independent of text-align). */
.sub-heading {
  font-size: 1.2em;
  font-weight: bold;
  cursor: pointer;
  margin: 0 0 0.3em;
  text-align: center;
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

.view-toggle {
  display: flex;
  gap: 0.5em;
  margin: 0.4em 0 0.8em;
}

.view-toggle-btn {
  padding: 5px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  background-color: #dddddd;
  color: #000000;
}

.view-toggle-btn.active {
  background-color: #277bb6;
  color: #ffffff;
}

.card-grid {
  display: grid;
  /* Fixed 3 columns (not auto-fit/auto-fill with a minmax upper bound): every
     section's cards are the exact same size regardless of how many items
     that section has -- a 1-item section's card fills 1 of 3 equal columns
     instead of stretching to fill the row. */
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin: 0 0 0.4em;
}

@media (max-width: 900px) {
  .card-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 560px) {
  .card-grid { grid-template-columns: 1fr; }
}

.link-card {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 8px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  background-color: #fafafa;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.link-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}

.link-card-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  background-color: #333333;
  background-image: linear-gradient(135deg, #2a2a2a, #4a4a4a);
  background-size: cover;
  background-position: center;
}

/* MES Math Q/A Livestreams' own thumbnails are all the same generic
   channel card (just a different episode number) -- half height in Grid
   View so they don't dominate the card the way a real per-video thumbnail
   would. The episode number sits in the bottom half of the source image, so
   crop from the top (background-position bottom) instead of the default
   centered crop, which cut the number off. */
#mathQaLivestreamsGrid .link-card-thumb {
  aspect-ratio: 16 / 4.5;
  background-position: center bottom;
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
  color: #000000;
}

.link-card-readmore {
  font-size: 0.78rem;
  font-weight: 600;
  color: #1a6fb0;
}

/* List View -- title / links row / thumbnail per item, 1 column on narrow
   screens, 2 side-by-side on big desktop screens (each thumbnail sized to
   its column, not stretched full-width). */
.list-view {
  display: block;
}

/* MES Math Q/A Livestreams only: 2 smaller columns on big desktop screens
   (its thumbnails are all the same generic card, so a smaller side-by-side
   pair reads fine) -- every other section stays the single big full-width
   row (matching mes.fm/hutchison's own List/Thumbnail view). A class (not
   an #id) so it stays the same specificity as .view-hidden below and the
   toggle can still hide this view -- an #id selector here would always
   beat .view-hidden's display:none regardless of source order. */
.list-view--compact {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 2em;
}

@media (min-width: 900px) {
  .list-view--compact {
    grid-template-columns: 1fr 1fr;
  }
}

.section-standalone-link {
  margin: 0 0 0.6em;
  font-weight: 600;
}

.section-standalone-link a {
  color: #1a6fb0;
}

.list-row {
  margin: 0 0 2em;
  padding: 0 0 2em;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}

.list-row:last-child {
  border-bottom: none;
}

.list-row h3 {
  font-size: 1.2em;
  margin: 0 0 0.3em;
}

.list-row p {
  margin: 0 0 0.6em;
}

.list-row a {
  color: #1a6fb0;
}

.list-thumb {
  display: block;
  /* Capped like mes.fm/hutchison's own Thumbnail View images (naturally
     sized within that page's 760px .container) -- not stretched edge to
     edge across this page's much wider band. Centered via margin:auto since
     a single full-width row is wider than this cap. MES Math Q/A
     Livestreams' own 2-column layout is already narrower than the cap, so
     this has no effect there. */
  max-width: 760px;
  width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 0 auto 1.4em;
  cursor: zoom-in;
}

/* Must come after .card-grid/.list-view above: same specificity (single
   class), so source order decides the tie -- this needs to win. */
.view-hidden {
  display: none;
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

/* Lightbox zoom in/out + drag-to-pan -- same add_lightbox_zoom.py pattern
   used repo-wide (e.g. mes.fm/hutchison), reused directly here rather than
   run against this page's build output (which npm run build would just
   overwrite). Sits top-left, mirroring the close button's top-right spot,
   so it never has to touch the bottom .lightbox-controls bar. */
.lightbox-zoom-controls {
  position: fixed;
  top: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 2147483647;
}

.lightbox-zoom-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: #ffffff;
  border: 0;
  cursor: pointer;
  font-size: 1.2em;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lightbox-zoom-btn:hover {
  background: rgba(0, 0, 0, 0.85);
}

.lightbox-zoom-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.lightbox-zoom-level {
  min-width: 3.4em;
  text-align: center;
  background: rgba(0, 0, 0, 0.7);
  color: #ffffff;
  font-size: 0.8em;
  padding: 5px 8px;
  border-radius: 999px;
}

.lightbox-image {
  transition: transform 0.15s ease;
}

.lightbox-image.zoomed {
  cursor: grab;
}

.lightbox-image.dragging {
  cursor: grabbing;
  transition: none;
}

@media (max-width: 600px) {
  .lightbox-zoom-btn { width: 36px; height: 36px; font-size: 1.05em; }
}

/* Table of contents: a fixed side column on very wide viewports (this page's
   own .outer-container is 75em/1200px wide, so the sidebar needs a lot more
   clearance than the 760px-article hub pages it's modeled on -- see
   mes.fm/vector-functions-problems-plus/build.mjs), collapsing to a
   <details> dropdown above the sections otherwise. */
.toc-sidebar {
  display: none;
}

@media (min-width: 1700px) {
  .toc-sidebar {
    display: block;
    position: fixed;
    top: 90px;
    /* rem (not em/px): tracks .outer-container's own em-based max-width at
       any text-size step (see html.text-sm/text-lg) without compounding
       against this element's own local 0.85em font-size below. */
    left: calc(50% + 39.375rem);
    width: 12.5rem;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    font-size: 0.85em;
    padding-right: 10px;
    scrollbar-width: thin;
    scrollbar-color: rgba(128, 128, 128, 0.4) transparent;
  }

  .toc-sidebar-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6em;
    margin: 0 0 0.7em;
  }

  .toc-sidebar .toc-title {
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
    margin: 0;
    color: #333333;
  }

  .toc-collapse-all-btn {
    font-size: 0.75em;
    padding: 3px 8px;
    white-space: nowrap;
  }

  .toc-sidebar a {
    display: block;
    padding: 0.3em 0;
    opacity: 0.85;
    text-decoration: none;
    color: #277bb6;
  }

  .toc-sidebar a:hover {
    opacity: 1;
    text-decoration: underline;
  }
}

.toc-mobile {
  margin: 1.2em 0;
}

@media (min-width: 1700px) {
  .toc-mobile {
    display: none;
  }
}

.toc-mobile summary {
  cursor: pointer;
  font-weight: bold;
  padding: 0.6em 0.9em;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 6px;
}

.toc-mobile .toc-links {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  padding: 0.8em 0.9em 0.2em;
}

.toc-mobile a {
  text-decoration: none;
  opacity: 0.9;
  color: #277bb6;
}

.toc-mobile a:hover {
  text-decoration: underline;
}

/* Text-size + dark/light display controls -- sit to the left of the
   hamburger button (#navbar-button), same corner, at every screen width.
   Styled to match the existing text-size-btn/theme-toggle-btn convention
   from add_text_size_control.py (e.g. mes.fm/hutchison-article-balloons).
   Unlike that convention (which scales a whole <article>), these scale
   only .page-description and the Jump To panel -- see the header-controls
   script -- leaving headings, card titles, and nav untouched. */
#header-controls {
  position: absolute;
  top: 16px;
  right: 68px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-control-btn {
  flex: 0 0 auto;
  width: 2em;
  height: 2em;
  padding: 0;
  margin: 0;
  border: 1.5px solid rgba(0, 0, 0, 0.15);
  border-radius: 50%;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9em;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  background-color: #3a3d52;
  color: #ffffff;
}

.header-control-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

@media (max-width: 768px) {
  .header { padding-right: 12em !important; }
}

/* Dark mode -- toggled by #themeToggleBtn in #header-controls, saved in
   localStorage. This classic mes.fm template has no dark mode of its own,
   so these are page-scoped overrides for what math/index.html itself
   renders (header/nav/footer are already navy-on-white and need no change). */
body.dark-mode {
  background-color: #1a1a1a;
}

body.dark-mode .inner-container {
  background-color: #232323;
  box-shadow: none;
}

body.dark-mode .calculator-title,
body.dark-mode .page-title,
body.dark-mode .page-description,
body.dark-mode .sub-heading,
body.dark-mode .arrow-icon,
body.dark-mode .list-row h3,
body.dark-mode .list-row p,
body.dark-mode .link-card-title {
  color: #eeeeee;
}

body.dark-mode .tag-line {
  color: #b8b8b8;
}

body.dark-mode .link-card {
  background-color: #2a2a2a;
  border-color: rgba(255, 255, 255, 0.15);
}

body.dark-mode .link-card-readmore,
body.dark-mode .section-standalone-link a,
body.dark-mode .list-row a,
body.dark-mode .toc-sidebar a,
body.dark-mode .toc-mobile a {
  color: #6cb6f5;
}

body.dark-mode .list-row {
  border-bottom-color: rgba(255, 255, 255, 0.15);
}

body.dark-mode .view-toggle-btn {
  background-color: #3a3a3a;
  color: #ffffff;
}

body.dark-mode .view-toggle-btn.active {
  background-color: #4a90d9;
}

body.dark-mode .button {
  color: #6cb6f5;
  border-color: #6cb6f5;
}

body.dark-mode .header-control-btn {
  background-color: #2e2e2e;
  color: #eeeeee;
  border-color: rgba(255, 255, 255, 0.25);
}

body.dark-mode .toc-mobile summary {
  border-color: rgba(255, 255, 255, 0.3);
  color: #eeeeee;
}

body.dark-mode .toc-sidebar .toc-title {
  color: #cccccc;
}
@media (max-width: 768px) {
  /* keep logo + title side by side like the tool pages, not stacked/centered */
  .header { display: flex !important; flex-wrap: wrap; align-items: center; }
  .logo-image-container { flex: 0 0 auto; width: auto !important; margin: 0 !important; }
  .logo-text-container { display: block !important; flex: 1 1 0; min-width: 0; width: auto !important; padding-left: 0.75em; text-align: left !important; margin: 0 !important; }
  .calculator-title { font-size: 1.3em; }
  .tag-line { font-size: 0.95em; }
}
</style>

<meta property="fb:app_id" content="120877788060946" />
<meta name="author" content="Math Easy Solutions Staff">
<meta property="og:type" content="website" />
<meta property="og:url" content="${CANONICAL}" />
<meta property="og:title" content="Math Tutorials" />
<meta property="og:image" content="https://mes.fm/img/logo-big.png" />
<meta property="og:description" content="Free math video/article tutorials on infinite sequences and series, vectors and the geometry of space, vector functions, spherical harmonics, and more." />
<meta name="description" content="Free math video/article tutorials on infinite sequences and series, vectors and the geometry of space, vector functions, spherical harmonics, and more.">
<meta name="twitter:card" content="summary">
<meta name="twitter:site" content="@MathEasySolns">
<meta name="twitter:title" content="Math Tutorials">
<meta name="twitter:description" content="Free math video/article tutorials on infinite sequences and series, vectors and the geometry of space, vector functions, spherical harmonics, and more.">
<meta name="twitter:image" content="https://mes.fm/img/logo-big.png">
<meta name="twitter:image:alt" content="Math Tutorials">
<script>
/* autoads-header-gap-guard: guards two gaps against Google Auto ads (in-page ad blocks,
   class \`google-auto-placed\`), plus Google's separate "annotation" text-ad
   formats, which are a different Auto ads mechanism than the in-page blocks
   above. 1) Logo header <-> nav bar: on desktop, any in-page ad caught here
   is relocated to just below the whole header+nav+logo-badge complex
   (before .outer-page-content) and allowed to show if it fills; on mobile
   (max-width: 768px, this repo's existing responsive breakpoint) it is
   hidden outright instead -- no ad shows below the nav bar on mobile at
   all. 2) Annotation/related-entry chips -- any element carrying the
   \`google-anno-skip\` class -- and 3) in-text link ads (\`<a class="google-anno">\`
   wrapping a \`<span class="google-anno-t">\` around an ordinary word): both are
   only guarded inside #header, #footer, the top .info-bar-container nav, or
   the .side-bar "Site Navigation" widget -- chips are hidden outright there,
   and in-text links are unwrapped back to plain text there, so the word
   stays readable without the ad behavior. Elsewhere in the actual page
   content both are left alone on purpose.
   Google's own placeholder-collapse doesn't reliably fire once we've moved
   the node, so we poll it: if no real ad iframe shows up within ~2s, we
   force the reserved space to 0 ourselves, so an unfilled slot never
   leaves a blank gap. */
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
    function inAnnotationGuardedZone(el) {
        return !!(el.closest('#header') || el.closest('#footer') || el.closest('.side-bar') || el.closest('.info-bar-container'));
    }
    function handleAnnotationChip(node) {
        if (node.classList && node.classList.contains('google-anno-skip') && inAnnotationGuardedZone(node)) {
            node.style.setProperty('display', 'none', 'important');
            return true;
        }
        return false;
    }
    function handleInTextLinkAd(node) {
        if (node.classList && node.classList.contains('google-anno') && node.parentNode && inAnnotationGuardedZone(node)) {
            node.replaceWith(document.createTextNode(node.textContent));
            return true;
        }
        return false;
    }
    function handle(node) {
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains('google-auto-placed')) {
            handleHeaderNavZone(node);
            return;
        }
        if (handleAnnotationChip(node)) return;
        if (handleInTextLinkAd(node)) return;
        if (node.querySelectorAll) {
            node.querySelectorAll('.google-auto-placed').forEach(function (n) {
                handleHeaderNavZone(n);
            });
            node.querySelectorAll('.google-anno-skip').forEach(function (n) {
                handleAnnotationChip(n);
            });
            node.querySelectorAll('.google-anno').forEach(function (n) {
                handleInTextLinkAd(n);
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
</head>
<body>
<nav class="toc-sidebar" aria-label="Table of contents">
  <div class="toc-sidebar-header">
    <div class="toc-title">Jump to</div>
    <button type="button" class="view-toggle-btn toc-collapse-all-btn toggle-all-lists-btn" onclick="toggleAllLists()">Collapse All</button>
  </div>
  ${tocLinksHtml}
</nav>
<div id="outer-container" class="outer-container">
  <div class="inner-container">
    <div id="header" class="header" role="banner">
      <div id="header-controls" role="group" aria-label="Display settings">
        <button type="button" id="textSizeDownBtn" class="header-control-btn" aria-label="Decrease text size" title="Decrease text size">A&minus;</button>
        <button type="button" id="textSizeUpBtn" class="header-control-btn" aria-label="Increase text size" title="Increase text size">A+</button>
        <button type="button" id="themeToggleBtn" class="header-control-btn" aria-label="Toggle dark mode" title="Toggle dark mode">&#127769;</button>
      </div>
      <a class="logo-image-container" href='/math'><img width="88" height="88" id="logo" class="logo lazyload" alt="MES Math Tutorials logo" data-src="https://mes.fm/img/logo-mark.png"></a>
      <div class="logo-text-container">
        <a class="calculator-title-link" href='/math'>
          <p class="calculator-title">MES Math Tutorials</p>
        </a>
        <p class="tag-line">Free math tutorials by Math Easy Solutions.</p>
      </div>

      <div class="social-container"><p class="social__text">Follow us!</p><ul class="social">
        <li class="social__logo social__hive"><a class="social__link" href="https://peakd.com/@mes" target="_blank"></a></li>
        <li class="social__logo social__telegram"><a class="social__link" href="https://t.me/meslinks" target="_blank"></a></li>
        <li class="social__logo social__fb"><a class="social__link" href="https://www.facebook.com/matheasysolutions" target="_blank"></a></li>
        <li class="social__logo social__twitter"><a class="social__link" href="https://twitter.com/MathEasySolns" target="_blank"></a></li>
        <li class="social__logo social__insta"><a class="social__link" href="https://instagram.com/matheasysolutions" target="_blank"></a></li>
        <li class="social__logo social__pin"><a class="social__link" href="https://www.pinterest.com/matheasysolns" target="_blank"></a></li>
        <li class="social__logo social__yt"><a class="social__link" href="https://www.youtube.com/user/MathEasySolutions" target="_blank"></a></li>
        <li class="social__logo social__patreon"><a class="social__link" href="https://www.patreon.com/matheasysolutions" target="_blank"></a></li>
      </ul></div>
    </div>
    <div class="info-bar-container" role="navigation" aria-label="Primary">
      <ul id="info-bar" class="info-bar shadow">
        <li class="info-bar__item"><a target="_self" class="info-bar__item__text" href='https://mes.fm/math'>Math Tutorials</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href='/calculators'>Calculators</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href='/tools'>Tools</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href='/mobile-apps'>Mobile Apps</a></li>
        <li class="info-bar__item"><a target="_self" class="info-bar__item__text" href='/puzzles'>Puzzles</a></li>
        <li class="info-bar__item"><a target="_self" class="info-bar__item__text" href='/memes'>Memes</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" target='_blank' rel="nofollow" href='https://matheasy.substack.com/'>Subscribe</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" target='_blank' href='https://teespring.com/stores/mes-store'>Store</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" target='_blank' href='/donate'>Donate</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" href='/contact'>Contact Us</a></li>
        <li class="info-bar__item info-bar__item--mes"><a class="info-bar__item__text" href="/" style="font-weight:bold;">MES.fm</a></li>
      </ul>
    </div>
    <a class="info-bar__logo-container" href="/" title="Math Easy Solutions"><img id="mes-logo" class="info-bar__logo lazyload" alt="math easy solutions logo" height="29" width="126" data-src="https://mes.fm/main_img/mes-logo-small.png"></a>
    <div class="outer-page-content">
      <div class="page-content" role="main">
        <div class="color-box"></div>
        <h1 class="page-title">Math Tutorials</h1>
        <p class="page-description">Free math video/article tutorials on infinite sequences and series, vectors and the geometry of space, vector functions, spherical harmonics, and more.</p>
        <details class="toc-mobile">
          <summary>Jump to section</summary>
          <nav class="toc-links" aria-label="Table of contents">
            ${tocLinksHtml}
          </nav>
        </details>
        <div id="main-content">
          <div class="wide">
            <button type="button" class="view-toggle-btn toggle-all-lists-btn" id="toggleAllListsBtn" onclick="toggleAllLists()" style="float:right;">Collapse All</button>
            <div style="clear:both;"></div>

${sectionsHtml}
          </div>
        </div>
      </div>
    </div>

    <!-- side bar -->
    <div class="side-bar">
      <div class="navbar-container shadow" role="navigation" aria-label="Site menu">
        <div class="button button--navbar" id="navbar-button" style="position:relative;">Site Navigation<span class="dropdown-symbol dropdown-symbol--dark" style="position:absolute;right:0.75em;top:50%;transform:translateY(-50%);margin-left:0;">&#9660;</span></div>
        <ul id="navbar" class="navbar">
          <li class="navbar__item navbar__item--social"><div class="social-container social-container--navbar"><p class="social__text">Follow us!</p><ul class="social">
            <li class="social__logo social__hive"><a class="social__link" href="https://peakd.com/@mes" target="_blank"></a></li>
            <li class="social__logo social__telegram"><a class="social__link" href="https://t.me/meslinks" target="_blank"></a></li>
            <li class="social__logo social__fb"><a class="social__link" href="https://www.facebook.com/matheasysolutions" target="_blank"></a></li>
            <li class="social__logo social__twitter"><a class="social__link" href="https://twitter.com/MathEasySolns" target="_blank"></a></li>
            <li class="social__logo social__insta"><a class="social__link" href="https://instagram.com/matheasysolutions" target="_blank"></a></li>
            <li class="social__logo social__pin"><a class="social__link" href="https://www.pinterest.com/matheasysolns" target="_blank"></a></li>
            <li class="social__logo social__yt"><a class="social__link" href="https://www.youtube.com/user/MathEasySolutions" target="_blank"></a></li>
            <li class="social__logo social__patreon"><a class="social__link" href="https://www.patreon.com/matheasysolutions" target="_blank"></a></li>
          </ul></div></li>
          <li class="navbar__item"><a class="navbar__link navbar__link--first" href="/">Home</a></li>
          <li class="navbar__item"><a target="_self" class="navbar__link" href="https://mes.fm/math">Math Tutorials</a></li>
          <li class="navbar__item"><span class="navbar__link navbar__link--dropdown">Calculators<span class="dropdown-symbol">&#9660;</span></span>
            <ul class="navbar__dropdown-container hide">
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/bmicalculator">&#9642; <span>BMI Calculator</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/gpacalculator">&#9642; <span>GPA Calculator</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/gradecalculator">&#9642; <span>Grade Calculator</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/inflationcalculator">&#9642; <span>Inflation Calculator</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/mortgagecalculator">&#9642; <span>Mortgage Calculator</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/percentagecalculator">&#9642; <span>Percentage Calculator</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/pokemongocalculator">&#9642; <span>Pokemon Go Calculator</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/vatcalculator">&#9642; <span>VAT Calculator</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/youtubemoney/index.html">&#9642; <span>YouTube Money Calculator</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="/calculators">&#9642; <span>More...</span></a></li>
            </ul>
          </li>
          <li class="navbar__item"><span class="navbar__link navbar__link--dropdown">Tools<span class="dropdown-symbol">&#9660;</span></span>
            <ul class="navbar__dropdown-container hide">
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/speedreader">&#9642; <span>Speed Reader</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="https://mes.fm/timer">&#9642; <span>Timer</span></a></li>
              <li class="navbar__item"><a class="navbar__link navbar__dropdown-item" href="/tools">&#9642; <span>More...</span></a></li>
            </ul>
          </li>
          <li class="navbar__item"><a target="_self" class="navbar__link" href="/puzzles">Puzzles</a></li>
          <li class="navbar__item"><a target="_self" class="navbar__link" href="/memes">Memes</a></li>
          <!-- MOBILE-APPS-DROPDOWN-REMOVED: every linked app was a dead App Store / Play Store listing (lapsed developer account) -- add an entry back here for each app once it is relaunched -->
          <li class="navbar__item"><a target="_blank" class="navbar__link" target='_blank' href="https://teespring.com/stores/mes-store">Store</a></li>
          <li class="navbar__item navbar__item--utility-added"><a target="_blank" rel="nofollow" class="navbar__link" href='https://matheasy.substack.com/'>Subscribe</a></li>
          <li class="navbar__item navbar__item--utility-added"><a target="_blank" class="navbar__link" href='/donate'>Donate</a></li>
          <li class="navbar__item navbar__item--utility-added"><a class="navbar__link" href='/contact'>Contact Us</a></li>
        </ul>
      </div>
    </div>

  </div>

  <div id="footer" class="footer" role="contentinfo">
    <div class="footer__item-container">
      <div class="footer__item">
        <a class="footer__text footer__text--title" href="/calculators">Calculators</a>
      </div>
      <div class="footer__item">
        <a class="footer__text footer__text--title" href="/tools">Tools</a>
      </div>
      <div class="footer__item footer__item--extra-padding">
        <a class="footer__text footer__text--title" href="/mobile-apps">Mobile Apps</a>
      </div>
      <div class="footer__item">
        <a class="footer__text footer__text--title" href="https://mes.fm">MES.fm</a>
      </div>
    </div>
    <a class="footer__text" href="/contact">Contact Us</a><span class="footer__separator"> | </span>
    <a class="footer__text" href="/privacy-policy">Privacy Policy</a><span class="footer__separator"> | </span>
    <a class="footer__text" target='_blank' href="/donate">Donate</a><span class="footer__separator"> | </span><a class="footer__text" target='_blank' rel="nofollow" href="https://matheasy.substack.com/">Subscribe</a>
    <div class="footer__text--extra-info"><span class="footer__text footer__text--copyright">Copyright &copy; <span id="copyright-year">2013</span>&nbsp;Math Easy Solutions</span></div>
  </div>
</div>

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
  // id: section id (e.g. 'mathQaLivestreams'). extraIds: capitalized suffixes
  // beyond 'Grid'/'List' (e.g. ['Stats']) for a section's extraViews -- each
  // gets its own toggle button (id+suffix+'Btn') and pane (id+suffix),
  // exactly like Grid/List, so N views can share one toggle group instead of
  // just two.
  function wireViewToggle(id, extraIds) {
    var suffixes = ['Grid', 'List'].concat(extraIds || []);
    var entries = suffixes
      .map(function (suffix) {
        return {
          btn: document.getElementById(id + suffix + 'Btn'),
          pane: document.getElementById(id + suffix),
        };
      })
      .filter(function (e) { return e.btn && e.pane; });
    if (entries.length < 2) return;

    entries.forEach(function (entry) {
      entry.btn.addEventListener('click', function () {
        entries.forEach(function (e) {
          var active = e === entry;
          e.btn.classList.toggle('active', active);
          e.pane.classList.toggle('view-hidden', !active);
        });
      });
    });
  }

${viewToggleWiring}
</script>

<script>
  // header-controls: text-size (A-/A+) and dark/light mode (sun/moon).
  // Lives next to #navbar-button so it's reachable at every screen width,
  // not just desktop. Same STEPS/localStorage-key convention as
  // add_text_size_control.py (see mes.fm/hutchison-article-balloons) -- but
  // that control scales a whole <article>; this one deliberately scales
  // only .page-description and the Jump To panel, leaving headings, card
  // titles, and nav untouched.
  (function () {
    var STEPS = [87.5, 100, 112.5, 125, 137.5, 150];
    var TARGETS = [
      { el: document.querySelector('.page-description'), base: 1 },
      { el: document.querySelector('.toc-sidebar'), base: 0.85 },
      { el: document.querySelector('.toc-mobile'), base: 1 },
    ].filter(function (t) { return t.el; });
    var downBtn = document.getElementById('textSizeDownBtn');
    var upBtn = document.getElementById('textSizeUpBtn');
    if (!TARGETS.length || !downBtn || !upBtn) return;

    function clampIndex(i) {
      return Math.max(0, Math.min(STEPS.length - 1, i));
    }

    var index;
    try {
      index = STEPS.indexOf(parseFloat(localStorage.getItem('articleFontScale')));
    } catch (e) {
      index = -1;
    }
    if (index === -1) index = STEPS.indexOf(100);

    function apply() {
      TARGETS.forEach(function (t) {
        t.el.style.fontSize = (t.base * STEPS[index] / 100) + 'em';
      });
      downBtn.disabled = index === 0;
      upBtn.disabled = index === STEPS.length - 1;
      try { localStorage.setItem('articleFontScale', String(STEPS[index])); } catch (e) {}
    }

    downBtn.addEventListener('click', function () {
      index = clampIndex(index - 1);
      apply();
    });
    upBtn.addEventListener('click', function () {
      index = clampIndex(index + 1);
      apply();
    });

    apply();
  })();

  (function () {
    var body = document.body;
    var themeBtn = document.getElementById('themeToggleBtn');

    function applyTheme(isDark) {
      body.classList.toggle('dark-mode', isDark);
      themeBtn.textContent = isDark ? '☀️' : '🌙';
      try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) {}
    }

    // Shared 'theme' key (same convention as the rest of the site), but --
    // unlike those pages, which default new visitors to dark -- this page
    // defaults to its normal light template unless dark was explicitly
    // chosen, since math/index.html had no dark mode at all before now.
    var savedTheme;
    try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
    applyTheme(savedTheme === 'dark');

    themeBtn.addEventListener('click', function () {
      applyTheme(!body.classList.contains('dark-mode'));
    });
  })();
</script>

<div class="lightbox-overlay" id="lightboxOverlay" role="dialog" aria-modal="true" aria-label="Image viewer">
  <div class="lightbox-zoom-controls" id="lightboxZoomControls">
    <button class="lightbox-zoom-btn" id="lightboxZoomOut" type="button" aria-label="Zoom out">&minus;</button>
    <span class="lightbox-zoom-level" id="lightboxZoomLevel">100%</span>
    <button class="lightbox-zoom-btn" id="lightboxZoomIn" type="button" aria-label="Zoom in">+</button>
  </div>
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

<script>
  // lightbox-zoom: adds +/- zoom and drag-to-pan on top of the lightbox
  // above -- same add_lightbox_zoom.py pattern used repo-wide (e.g.
  // mes.fm/hutchison). Purely additive: only touches the #lightboxZoom*
  // elements it creates itself, resetting whenever #lightboxImage's src or
  // #lightboxOverlay's open state changes, so it works regardless of how
  // the lightbox's own open/prev/next logic runs.
  (function () {
    var overlay = document.getElementById('lightboxOverlay');
    var imageEl = document.getElementById('lightboxImage');
    var zoomOutBtn = document.getElementById('lightboxZoomOut');
    var zoomInBtn = document.getElementById('lightboxZoomIn');
    var zoomLevelEl = document.getElementById('lightboxZoomLevel');
    if (!overlay || !imageEl || !zoomOutBtn || !zoomInBtn || !zoomLevelEl) return;

    var ZOOM_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4];
    var zoomIndex = 0;
    var panX = 0, panY = 0;
    var dragging = false, dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

    function applyTransform() {
      imageEl.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + ZOOM_STEPS[zoomIndex] + ')';
      imageEl.classList.toggle('zoomed', zoomIndex > 0);
      zoomLevelEl.textContent = Math.round(ZOOM_STEPS[zoomIndex] * 100) + '%';
      zoomOutBtn.disabled = zoomIndex === 0;
      zoomInBtn.disabled = zoomIndex === ZOOM_STEPS.length - 1;
    }

    function zoomTo(index) {
      zoomIndex = Math.max(0, Math.min(ZOOM_STEPS.length - 1, index));
      if (zoomIndex === 0) { panX = 0; panY = 0; }
      applyTransform();
    }

    function resetZoom() {
      dragging = false;
      imageEl.classList.remove('dragging');
      zoomTo(0);
    }

    zoomOutBtn.addEventListener('click', function () { zoomTo(zoomIndex - 1); });
    zoomInBtn.addEventListener('click', function () { zoomTo(zoomIndex + 1); });

    imageEl.addEventListener('dblclick', function () {
      zoomTo(zoomIndex > 0 ? 0 : 2);
    });

    imageEl.addEventListener('mousedown', function (e) {
      if (zoomIndex === 0) return;
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = panX;
      panStartY = panY;
      imageEl.classList.add('dragging');
      e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      panX = panStartX + (e.clientX - dragStartX);
      panY = panStartY + (e.clientY - dragStartY);
      applyTransform();
    });

    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      imageEl.classList.remove('dragging');
    });

    imageEl.addEventListener('touchstart', function (e) {
      if (zoomIndex === 0 || e.touches.length !== 1) return;
      dragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      panStartX = panX;
      panStartY = panY;
    }, { passive: true });

    imageEl.addEventListener('touchmove', function (e) {
      if (!dragging || e.touches.length !== 1) return;
      panX = panStartX + (e.touches[0].clientX - dragStartX);
      panY = panStartY + (e.touches[0].clientY - dragStartY);
      applyTransform();
    }, { passive: true });

    imageEl.addEventListener('touchend', function () { dragging = false; });

    document.addEventListener('keydown', function (e) {
      if (!overlay.classList.contains('open')) return;
      if (e.key === '+' || e.key === '=') zoomTo(zoomIndex + 1);
      else if (e.key === '-' || e.key === '_') zoomTo(zoomIndex - 1);
    });

    new MutationObserver(resetZoom).observe(imageEl, { attributes: true, attributeFilter: ['src'] });
    new MutationObserver(function () {
      if (overlay.classList.contains('open')) resetZoom();
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });

    applyTransform();
  })();
</script>

<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.11.3/jquery.min.js"></script>
<script>
var MES_Vars = {
    mobile:false,
    hide_search:false,
    current_tab:1,
    info_bar_tab:0
}
</script>
<script src="/main_js/lazysizes.min.js?v=1.0.3" async></script>
<script src="/main_js/main.js?v=1.0.3"></script>
<script>document.getElementById('copyright-year').textContent = new Date().getFullYear();</script>
<!-- PAGEVIEW-TRACKING-INSERTED --><script src="/main_js/track.js" defer></script><script src="/main_js/info-bar-fit.js" defer></script>
</body>
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
