// Build-time generator for mes.fm/hutchison.
//
// Fetches the post from Hive's public bridge API and writes a static index.html.
// This is NOT run by Vercel — run it manually (`npm run build`) whenever you want
// to refresh the vote/comment counts, then commit the regenerated index.html.
//
// The hand-maintained "Posts and Updates" and "Videos" sections (not part of the
// Hive article) render as thumbnail-card grids promoted above the article — edit
// the POSTS_AND_UPDATES / VIDEOS arrays below (newest first); each card's image +
// excerpt are scraped from the target page's og: tags at build time and cached
// in link-meta.json. This mirrors the setup in mes.fm/911/build.mjs.
//
// Usage:
//   npm install
//   npm run build

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AUTHOR = "mes";
const PERMLINK = "hutchisoneffect";
const PEAKD_URL = `https://peakd.com/science/@${AUTHOR}/${PERMLINK}`;

// Committed cache of link metadata scraped from each Posts/Videos card target
// (see resolveAllMeta). Kept in git so a later build still has thumbnails and
// excerpts even if a source host (3speak, leopedia, a mirror page) is briefly
// unreachable.
const META_CACHE_PATH = join(__dirname, "link-meta.json");

async function fetchPost() {
  const res = await fetch("https://api.hive.blog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "bridge.get_post",
      params: { author: AUTHOR, permlink: PERMLINK },
      id: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`Hive API request failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Hive API error: ${JSON.stringify(data.error)}`);
  }
  if (!data.result) {
    throw new Error("Hive API returned no result — check author/permlink.");
  }
  return data.result;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Topic-homepage card grid — shared treatment (fetchMeta / resolveAllMeta /
// buildCardGrid + the .card-grid/.link-card CSS in buildPage). Kept in sync with
// the identical block in mes.fm/911/build.mjs; copy into another topic page's
// build.mjs to give its link sections the same thumbnail-card layout.
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

// Render a link section as a responsive thumbnail-card grid, wrapped in the same
// collapsible .chapter-toggle markup every other chapter uses (so toggleChapter
// / toggleAllChapters / the "Jump to" anchors keep working unchanged).
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

  return `<div class="chapter-toggle" id="${id}">
<h1 class="chapter-toggle-header" onclick="toggleChapter('${id}-list')"><center>${label} <span id="arrowIcon-${id}-list" class="arrow-icon">&#9660;</span></center></h1>
<div id="${id}-list" class="chapter-toggle-list card-grid">
${cards}
</div>
</div>
`;
}

function formatDate(isoString) {
  const date = new Date(isoString + "Z");
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Hive posts sometimes have a table row immediately followed by a plain text
// line with no blank line between them. Per GFM, a line with no "|" should end
// the table, but marked's table lexer is lenient and swallows it as an extra
// row. Insert the missing blank line so the following text renders as its own
// paragraph instead of a table row.
function fixTableBoundaries(markdown) {
  const lines = markdown.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const cur = lines[i];
    const next = lines[i + 1];
    const curIsTableRow = cur.includes("|") && cur.trim() !== "";
    const nextIsBlank = next === undefined || next.trim() === "";
    const nextIsTableRow = next !== undefined && next.includes("|");
    if (curIsTableRow && !nextIsBlank && !nextIsTableRow) {
      out.push("");
    }
  }
  return out.join("\n");
}

// Hive posts often contain a bare YouTube URL on its own line (PeakD renders
// these as an embedded player). Turn them into a responsive iframe embed
// before markdown parsing, since marked will otherwise just linkify the URL.
function embedYoutubeLinks(markdown) {
  return markdown.replace(
    /^[ \t]*(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)\S*[ \t]*$/gm,
    (_match, videoId) =>
      `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
  );
}

// The original Hive post links the label "mes.fm/hutchison" to the 3 TB
// uncompressed-footage Google Drive folder. That short URL now serves this very
// mirror page instead (the Drive redirect moved to /hutchison-drive), so rewrite
// the one in-body reference (both label and href) to match — otherwise it would
// display the wrong URL and point back at this page instead of the footage archive.
function fixHutchisonDriveLink(markdown) {
  return markdown.replace(
    /\[mes\.fm\/hutchison\]\(https:\/\/mes\.fm\/hutchison\)/g,
    "[mes.fm/hutchison-drive](https://mes.fm/hutchison-drive)"
  );
}

// The post's intro list ends with a "MES Links: https://mes.fm/links" bullet,
// but the page's own top-bar already has a "← mes.fm/links" link right above
// the title, so that bullet is a redundant duplicate -- drop it.
function removeRedundantMesLinksBullet(markdown) {
  return markdown.replace(/^-\s*MES Links:.*\n?/m, "");
}

// The post's top-level section headers (the "# <center>X</center>" lines --
// Highlights, Articles, Unedited Footage, etc.) all render as
// <h1><center>X</center></h1> in the parsed body. Give each one an id and
// collect a {id, label} list so a table-of-contents can link straight to it.
// Two sections share the literal title "Articles", so duplicate slugs/labels
// get a "(2)"-style suffix to stay unique and distinguishable.
function addSectionAnchors(bodyHtml) {
  const seen = new Map();
  const toc = [];
  const html = bodyHtml.replace(/<h1><center>(.*?)<\/center><\/h1>/g, (match, inner) => {
    const plain = inner
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    const slug = plain
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
    const occurrence = (seen.get(slug) || 0) + 1;
    seen.set(slug, occurrence);
    const id = occurrence === 1 ? slug : `${slug}-${occurrence}`;
    const label = occurrence === 1 ? plain : `${plain} (${occurrence})`;
    toc.push({ id, label });
    return `<h1 id="${id}"><center>${inner}</center></h1>`;
  });
  return { html, toc };
}

// Every Hive-sourced chapter is preceded by its own "<hr>\n<h1 id=\"...\">"
// marker (added by addSectionAnchors) and runs until the next one (or the end
// of the body). Wrap each chapter's h1 + its content in a chapter-toggle div
// so every chapter -- not just the hand-maintained "Posts and Updates" one --
// can be collapsed via toggleChapter(). The leading <hr> stays outside the
// div, as the visual divider between chapters.
function wrapChaptersInToggles(html) {
  const re = /<hr>\n<h1 id="([^"]+)"><center>([\s\S]*?)<\/center><\/h1>/g;
  const matches = [...html.matchAll(re)];
  if (matches.length === 0) return html;

  let out = html.slice(0, matches[0].index);
  matches.forEach((m, i) => {
    const [full, id, titleInner] = m;
    const contentStart = m.index + full.length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const content = html.slice(contentStart, contentEnd);
    out += `<hr>\n<div class="chapter-toggle" id="${id}">\n`;
    out += `<h1 class="chapter-toggle-header" onclick="toggleChapter('${id}-list')"><center>${titleInner} <span id="arrowIcon-${id}-list" class="arrow-icon">&#9660;</span></center></h1>\n`;
    out += `<div id="${id}-list" class="chapter-toggle-list">${content}</div>\n`;
    out += `</div>\n`;
  });
  return out;
}

// "Posts and Updates" and "Videos" aren't part of the Hive article -- they're
// hand-maintained lists of mirrored mes.fm pages (e.g.
// mes.fm/hutchison-health-sept6-2026, mes.fm/livestream-66-trailer) that we keep
// adding to without re-publishing the Hive post. Rendered as thumbnail-card
// grids by buildCardGrid() and promoted above the article as the page's homepage
// feature. To add an entry: drop a { href, title } object at the TOP of the list
// (newest first). The thumbnail + excerpt are scraped from the target page's og:
// tags at build time (resolveAllMeta) and cached in link-meta.json.
const POSTS_AND_UPDATES = [
  { href: "https://mes.fm/hutchison-health-sept6-2026", title: "John Hutchison is coming home — health update" },
  { href: "https://mes.fm/hutchison-health-sept5-2026", title: "Prayers up for John Hutchison, again — health update" },
  { href: "https://mes.fm/bought-911-hutchison-shirt", title: "Someone bought a 9/11 DJW Book shirt and Hutchison Effect shirt" },
  { href: "https://mes.fm/hutchison-health-aug22-2026", title: "Prayers up for John Hutchison — health update" },
];

const VIDEOS = [
  { href: "https://mes.fm/hutchison-effect-steel-molybdenum", title: "Hutchison Effect: George Hathaway and John Alexander Discuss Crumbling Steel & Bent Molybdenum Rods" },
  { href: "https://mes.fm/livestream-66-trailer", title: "Trailer for MES Livestream 66: Rare Hutchison Effect Footage" },
];

function buildPage(post, meta) {
  const title = post.title;
  const preprocessed = embedYoutubeLinks(
    fixTableBoundaries(removeRedundantMesLinksBullet(fixHutchisonDriveLink(post.body)))
  );
  const { html: parsedBodyHtml, toc } = addSectionAnchors(marked.parse(preprocessed));
  const wrappedBodyHtml = wrapChaptersInToggles(parsedBodyHtml);

  // "Posts and Updates" isn't part of the Hive article -- it's a hand-maintained
  // chapter for mirrored posts (e.g. mes.fm/hutchison-health-aug22-2026) that we
  // want to keep adding to without re-publishing the Hive post itself. Pin it to
  // the top of the TOC and splice it in as the first chapter, right before the
  // first Hive-sourced chapter.
  // "Videos" is also hand-maintained (not part of the Hive article) -- a place to
  // link mes.fm video-clip mirrors (e.g. mes.fm/livestream-66-trailer). Pinned
  // right after "Posts and Updates".
  // "Important Links" is the article's intro blurb + reference-link list, turned
  // into its own collapsible chapter (see importantLinksChapter); it's the first
  // chapter inside .post-body, below the card grids.
  toc.unshift({ id: "important-links", label: "Important Links" });
  // The card-grid sections, in page order (they sit above the article).
  toc.unshift({ id: "videos", label: "Videos" });
  toc.unshift({ id: "posts-and-updates", label: "Posts and Updates" });
  const tocLinksHtml = toc
    .map((t) => `<a href="#${escapeHtml(t.id)}">${escapeHtml(t.label)}</a>`)
    .join("\n      ");

  // A collapse/expand-all control (see .chapters-toolbar / toggleAllChapters()).
  // "Collapse All" folds every chapter on the page including the "Posts and
  // Updates" / "Videos" card grids and the article sections.
  const chaptersToolbar = `<div class="chapters-toolbar">
<button id="toggleAllChaptersBtn" class="theme-toggle-btn toggle-all-chapters-btn" onclick="toggleAllChapters()">Collapse All</button>
</div>
`;

  // The two hand-maintained link sections, rendered as thumbnail-card grids and
  // promoted above the article as the page's homepage feature.
  const featureHtml =
    chaptersToolbar +
    buildCardGrid("posts-and-updates", "Posts and Updates", POSTS_AND_UPDATES, meta, "Read more") +
    "<hr>\n" +
    buildCardGrid("videos", "Videos", VIDEOS, meta, "Watch");

  // Everything before the first Hive-sourced <h1> section (the intro blurb +
  // reference-link list) becomes its own collapsible "Important Links" chapter
  // so it folds along with the rest.
  const firstChapterMatch = wrappedBodyHtml.match(/<hr>\n<div class="chapter-toggle" id="/);
  const leadingHtml = (firstChapterMatch
    ? wrappedBodyHtml.slice(0, firstChapterMatch.index)
    : wrappedBodyHtml
  ).trim();
  const restChaptersHtml = firstChapterMatch
    ? wrappedBodyHtml.slice(firstChapterMatch.index + "<hr>\n".length)
    : "";
  const importantLinksChapter = `<div class="chapter-toggle" id="important-links">
<h1 class="chapter-toggle-header" onclick="toggleChapter('important-links-list')"><center>Important Links <span id="arrowIcon-important-links-list" class="arrow-icon">&#9660;</span></center></h1>
<div id="important-links-list" class="chapter-toggle-list">
${leadingHtml}
</div>
</div>
<hr>
`;
  // Everything inside .post-body: the "Important Links" chapter then the
  // Hive-sourced chapters. The card grids are in the wider band above
  // (featureHtml).
  const articleBodyHtml = importantLinksChapter + restChaptersHtml;
  const publishedDate = formatDate(post.created);
  const voteCount = post.stats?.total_votes ?? 0;
  const commentCount = post.children ?? 0;
  const reblogCount = post.reblogs ?? 0;
  const description =
    post.json_metadata?.description ||
    `${title} — an index of MES Hutchison Effect videos, mirrored from the Hive blockchain.`;
  const ogImage =
    (post.json_metadata && Array.isArray(post.json_metadata.image) && post.json_metadata.image[0]) ||
    ((String(articleBodyHtml).match(/<img[^>]+src="([^"]+)"/i) || [])[1]) ||
    "";
  const ogImageTag = ogImage ? `\n  <meta property="og:image" content="${escapeHtml(ogImage)}">` : "";
  const twitterImageTag = ogImage ? `\n  <meta name="twitter:image" content="${escapeHtml(ogImage)}">` : "";
  const buildDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="MES">
  <link rel="canonical" href="https://mes.fm/hutchison" />
  <!-- OG-TAGS:START -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="MES Truth">
  <meta property="og:url" content="https://mes.fm/hutchison">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">${ogImageTag}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@MathEasySolns">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">${twitterImageTag}
  <!-- OG-TAGS:END -->
  <link rel="icon" href="https://mes.fm/img/favicon.ico?v=1.0" type="image/x-icon" />
  <title>${escapeHtml(title)} | Math Easy Solutions</title>
  <style>
    * { box-sizing: border-box; }

    body {
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 0 20px 60px;
      transition: background-color 0.3s, color 0.3s;
    }

    body.light { background-color: #ffffff; color: #222222; }
    body.light a { color: #1a6fb0; }
    body.dark { background-color: #1a1a1a; color: #eeeeee; }
    body.dark a { color: #6cb6f5; }

    .container {
      max-width: 760px;
      margin: 0 auto;
    }

    /* Wider band for the homepage header + the card grids. The article prose
       below stays in .container at a readable measure. */
    .wide {
      max-width: 1180px;
      margin: 0 auto;
    }

    .page-lede {
      max-width: 760px;
      margin: 0.2em 0 1em;
      font-size: 1.05em;
      opacity: 0.8;
    }

    /* The "Posts and Updates" / "Videos" collapsible headers sit in the .wide
       band, outside .post-body, so restate the centered section-header look. */
    .wide .chapter-toggle-header {
      text-align: center;
      font-size: 1.5em;
      margin: 1.2em 0 0.6em;
    }

    /* Topic-homepage card grid — see buildCardGrid() in build.mjs. Kept in sync
       with the identical block in mes.fm/911/build.mjs. */
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

    /* Override the global body.light/body.dark anchor colour (higher specificity
       than .link-card) so the card title/excerpt read as body text, not link
       blue. The "Read more" span opts back into the link colour below. */
    body.light .link-card { background-color: #fafafa; color: #222222; }
    body.dark .link-card { background-color: #232323; color: #eeeeee; }

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

    /* Thumbnail View / Grid View toggle for long Hive-sourced chapters that list
       one entry per video (title + link row + image) -- see enableGridToggle()
       below. Grid View is the default, built at runtime into the same
       .card-grid used for the card-grid sections above, using each entry's
       first link + first image. Thumbnail View is the chapter's own
       markdown-rendered markup, left untouched, available via the toggle. */

    /* These chapters live in the narrow 760px .container, but Grid View should
       read as big as the card-grid sections in the 1180px .wide band above.
       updateBreakout() (below) sizes/positions this wrapper at runtime to
       exactly match the current .wide element's rect (no static width here --
       it's set inline in JS), breaking the grid out of the article column
       without touching the column's own width. */

    /* A chapter's leading reference line (e.g. "Free Energy playlist") that sat
       before its first entry heading -- pulled out of both views so it's
       always visible, right above the toggle buttons. */
    .grid-toggle-lead {
      margin: 0 0 0.8em;
      font-size: 0.9em;
    }

    .view-toggle {
      display: flex;
      gap: 0.5em;
      margin: 0 0 1em;
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

    .view-hidden {
      display: none;
    }

    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-top: 16px;
    }

    .theme-toggle-btn {
      flex: 0 0 auto;
      padding: 5px 10px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85em;
      white-space: nowrap;
    }

    body.light .theme-toggle-btn { background-color: #dddddd; color: #000000; }
    body.dark .theme-toggle-btn { background-color: #444444; color: #ffffff; }

    .site-link {
      font-size: 0.9em;
    }

    h1 {
      font-size: 2em;
      margin: 0.4em 0 0.2em;
    }

    .post-meta {
      font-size: 0.9em;
      opacity: 0.85;
      margin-bottom: 0.6em;
    }

    .post-meta span:not(:last-child)::after {
      content: " \\00b7 ";
    }

    .peakd-link {
      display: inline-block;
      margin: 0.6em 0 1.4em;
      font-size: 0.9em;
      font-style: italic;
    }

    .post-body {
      word-wrap: break-word;
    }

    .post-body h1 {
      text-align: center;
      font-size: 1.5em;
      margin: 1.8em 0 0.8em;
    }

    .post-body h2 {
      font-size: 1.15em;
      margin: 1.6em 0 0.5em;
    }

    .post-body img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      cursor: zoom-in;
    }

    .lightbox-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.96);
      /* Max signed 32-bit z-index: AdSense's own overlay/side-rail formats are
         known to use this same value, so anything lower can end up rendering
         underneath them. Matching it guarantees the lightbox -- and its opaque
         backdrop -- always wins the stacking order, hiding any ad behind it
         (belt-and-suspenders alongside the JS ad guard, which does the actual
         reliable hiding -- see adGuard below). */
      z-index: 2147483647;
      align-items: center;
      justify-content: center;
      /* Reserve room for the fixed bottom control bar (see .lightbox-controls)
         so it never overlaps the image, and so the image is centered in the
         space above it rather than the full viewport. */
      padding-bottom: 120px;
    }

    .lightbox-overlay.open {
      display: flex;
    }

    .lightbox-image {
      width: 100vw;
      max-width: 100vw;
      max-height: calc(100vh - 120px);
      object-fit: contain;
      display: block;
    }

    .lightbox-controls {
      /* Fixed to the viewport, not stacked under the image in normal flow --
         so it stays in the exact same spot no matter the image's aspect
         ratio/rendered height, letting you click through images rapidly
         without re-aiming the mouse. */
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
    .lightbox-next:hover {
      background: rgba(0, 0, 0, 0.85);
    }

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

    .post-body table {
      border-collapse: collapse;
      max-width: 100%;
      margin: 1.5em 0;
    }

    .post-body td,
    .post-body th {
      border: 1px solid;
      border-color: inherit;
      padding: 6px 10px;
    }

    .video-embed {
      position: relative;
      width: 100%;
      padding-bottom: 56.25%;
      margin: 1.2em 0;
    }

    .video-embed iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }

    .post-body blockquote {
      border-left: 3px solid #5ea9dd;
      margin: 1em 0;
      padding: 0.2em 1em;
      opacity: 0.9;
    }

    hr {
      margin: 2em 0;
      opacity: 0.3;
    }

    .build-note {
      font-size: 0.8em;
      opacity: 0.6;
      text-align: center;
    }

    /* Every chapter (the hand-maintained "Posts and Updates" one plus every
       Hive-sourced <h1> section) is a collapsible dropdown -- see
       wrapChaptersInToggles() in build.mjs and toggleChapter() below. */
    .chapter-toggle-header {
      cursor: pointer;
    }

    .chapter-toggle-header .arrow-icon {
      font-size: 0.6em;
      display: inline-block;
      vertical-align: middle;
      transition: transform 0.3s ease;
    }

    .chapter-toggle-list.hidden {
      display: none;
    }

    /* Pinned to the top of the post body, just under the <hr> that follows the
       article meta -- a collapse/expand-all control anchored to the right edge,
       above the first ("Important Links") chapter. */
    .chapters-toolbar {
      display: flex;
      justify-content: flex-end;
      margin: -0.8em 0 0.4em;
    }

    /* Table of contents: a fixed side column only once the viewport is wide
       enough to clear the 1180px .wide band (the card grids), collapsing to a
       <details> dropdown above the article on anything narrower -- laptops,
       tablets, and phones alike. */
    .toc-sidebar {
      display: none;
    }

    @media (min-width: 1600px) {
      .toc-sidebar {
        display: block;
        position: fixed;
        top: 90px;
        left: calc(50% + 610px);
        width: 200px;
        max-height: calc(100vh - 120px);
        overflow-y: auto;
        font-size: 0.85em;
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
        opacity: 0.6;
        margin: 0;
      }

      .toc-collapse-all-btn {
        font-size: 0.8em;
        opacity: 0.65;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        text-decoration: underline;
        color: inherit;
        font-family: inherit;
        white-space: nowrap;
      }

      .toc-collapse-all-btn:hover {
        opacity: 1;
      }

      .toc-sidebar a {
        display: block;
        padding: 0.3em 0;
        opacity: 0.85;
        text-decoration: none;
      }

      .toc-sidebar a:hover {
        opacity: 1;
        text-decoration: underline;
      }
    }

    .toc-mobile {
      margin: 1.2em 0;
      max-width: 760px;
    }

    @media (min-width: 1600px) {
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
    }

    .toc-mobile a:hover {
      text-decoration: underline;
    }

    @media (max-width: 600px) {
      h1 { font-size: 1.5em; }
      body { padding: 0 12px 40px; }
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
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1461238060884369" crossorigin="anonymous"></script>
</head>
<body class="dark">
  <nav class="toc-sidebar" aria-label="Table of contents">
    <div class="toc-sidebar-header">
      <div class="toc-title">Jump to</div>
      <button type="button" class="toc-collapse-all-btn toggle-all-chapters-btn" onclick="toggleAllChapters()">Collapse All</button>
    </div>
      ${tocLinksHtml}
  </nav>
  <div class="wide">
    <div class="top-bar">
      <a class="site-link" href="https://mes.fm/links">&larr; mes.fm/links</a>
      <button id="themeToggle" class="theme-toggle-btn">Loading...</button>
    </div>

    <h1>${escapeHtml(title)}</h1>
    <p class="page-lede">MES coverage of the Hutchison Effect &mdash; John Hutchison's antigravity and materials-transmutation demonstrations: videos, rare footage, articles, updates, and links. Bookmark this page; it is continually updated.</p>
    <div class="post-meta">
      <span>By ${escapeHtml(AUTHOR)}</span>
      <span>${escapeHtml(publishedDate)}</span>
      <span>${voteCount} votes</span>
      <span>${commentCount} comments</span>
      <span>${reblogCount} reblogs</span>
    </div>
    <a class="peakd-link" href="${PEAKD_URL}" target="_blank" rel="noopener">Originally published on Hive &rarr;</a>

    <details class="toc-mobile">
      <summary>Jump to section</summary>
      <nav class="toc-links" aria-label="Table of contents">
        ${tocLinksHtml}
      </nav>
    </details>
  </div>

  <div class="wide">
${featureHtml}
  </div>

  <hr>

  <div class="container">
    <div class="post-body">
${articleBodyHtml}
    </div>

    <hr>

    <a class="peakd-link" href="${PEAKD_URL}" target="_blank" rel="noopener">Originally published on Hive &rarr;</a>
    <p class="build-note">
      Vote/comment/reblog counts and article text were fetched from the Hive blockchain
      at build time (${buildDate}) and are not live.
    </p>
  </div>

  <div class="lightbox-overlay" id="lightboxOverlay" google-side-rail-overlap="false" role="dialog" aria-modal="true" aria-label="Image viewer">
    <button class="lightbox-close" id="lightboxClose" type="button" aria-label="Close image viewer">&times;</button>
    <img class="lightbox-image" id="lightboxImage" src="" alt="">
    <div class="lightbox-controls" id="lightboxControls">
      <button class="lightbox-prev" id="lightboxPrev" type="button" aria-label="Previous image">&#8249;</button>
      <div class="lightbox-counter" id="lightboxCounter"></div>
      <button class="lightbox-next" id="lightboxNext" type="button" aria-label="Next image">&#8250;</button>
    </div>
  </div>

  <script>
    function toggleChapter(listId) {
      const list = document.getElementById(listId);
      const arrowIcon = document.getElementById('arrowIcon-' + listId);
      list.classList.toggle('hidden');
      arrowIcon.textContent = list.classList.contains('hidden') ? '▼' : '▲';
    }

    function toggleAllChapters() {
      const lists = document.querySelectorAll('.chapter-toggle-list');
      const buttons = document.querySelectorAll('.toggle-all-chapters-btn');
      const collapse = lists.length === 0 || !lists[0].classList.contains('hidden');
      lists.forEach((list) => {
        list.classList.toggle('hidden', collapse);
        const arrowIcon = document.getElementById('arrowIcon-' + list.id);
        if (arrowIcon) arrowIcon.textContent = collapse ? '▼' : '▲';
      });
      buttons.forEach((btn) => { btn.textContent = collapse ? 'Expand All' : 'Collapse All'; });
    }

    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');

    function setTheme(isDark) {
      if (isDark) {
        body.classList.add('dark');
        body.classList.remove('light');
        themeToggle.textContent = 'Switch to Light Mode';
        localStorage.setItem('theme', 'dark');
      } else {
        body.classList.add('light');
        body.classList.remove('dark');
        themeToggle.textContent = 'Switch to Dark Mode';
        localStorage.setItem('theme', 'light');
      }
    }

    const saved = localStorage.getItem('theme');
    setTheme(saved !== 'light');

    themeToggle.addEventListener('click', () => {
      setTheme(!body.classList.contains('dark'));
    });
  </script>

  <script>
    // Thumbnail View / Grid View toggle for long Hive-sourced chapters that list
    // one entry per <h2> heading, followed by a link-row <p> and an image <p>
    // (Highlights, Articles, News Reels, Unedited Footage, etc.). Grid View is
    // the default: built once at runtime into the same .card-grid used for the
    // card-grid sections above, using each entry's first <a> (the leftmost
    // link) as the card's href and its first <img> as the thumbnail. Thumbnail
    // View is the chapter's own markdown-rendered markup, left untouched,
    // available as a fallback via the toggle. Add a chapter's id + heading tag
    // to GRID_VIEW_CHAPTERS to give it the same toggle. Kept in sync with the
    // identical mechanism in mes.fm/911/build.mjs.
    //
    // These chapters live in the narrow 760px article column (.container), but
    // Grid View should read as big as the card-grid sections in the 1180px
    // .wide band above -- so the grid is wrapped in a .card-grid-breakout div
    // that updateBreakout() sizes/positions (via inline width/margin-left) to
    // exactly match the current .wide element's rect, on load, on window
    // resize, and whenever Grid View is switched back on.
    (function () {
      var GRID_VIEW_CHAPTERS = [
        { id: 'highlights', heading: 'H2' },
        { id: 'articles', heading: 'H2' },
        { id: 'debunking-debunkers', heading: 'H2' },
        { id: 'news-reels', heading: 'H2' },
        { id: 'unedited-footage', heading: 'H2' },
        { id: 'interviews-and-presentations', heading: 'H2' },
        { id: 'cold-fusion-low-energy-nuclear-reactions-lenr', heading: 'H2' },
        { id: 'mes-livestreams', heading: 'H2' },
      ];

      // Some Hive image URLs carry an unescaped apostrophe in their filename
      // (a "#filename" fragment some old steemitimages.com uploads use), which
      // would otherwise prematurely close the quoted url('...') below and drop
      // the whole background-image. Percent-encode it so the string stays a
      // valid CSS <url>.
      function cssUrl(url) {
        return "url('" + String(url).split("'").join('%27') + "')";
      }

      var breakouts = [];

      function updateBreakout(el) {
        var wideEl = document.querySelector('.wide');
        if (!wideEl) return;
        el.style.width = '';
        el.style.marginLeft = '';
        var wideRect = wideEl.getBoundingClientRect();
        var selfRect = el.getBoundingClientRect();
        el.style.width = wideRect.width + 'px';
        el.style.marginLeft = (wideRect.left - selfRect.left) + 'px';
      }

      window.addEventListener('resize', function () {
        breakouts.forEach(updateBreakout);
      });

      function buildEntries(children, headingTag) {
        var entries = [];
        var current = null;
        children.forEach(function (node) {
          if (node.tagName === headingTag) {
            current = { title: node.textContent.trim(), nodes: [] };
            entries.push(current);
          } else if (current) {
            current.nodes.push(node);
          }
        });
        return entries;
      }

      function firstMatch(nodes, selector) {
        for (var i = 0; i < nodes.length; i++) {
          if (!nodes[i].querySelector) continue;
          var found = nodes[i].querySelector(selector);
          if (found) return found;
        }
        return null;
      }

      function enableGridToggle(config) {
        var list = document.getElementById(config.id + '-list');
        if (!list) return;
        var headingTag = config.heading || 'H1';
        var children = Array.prototype.slice.call(list.children);
        var entries = buildEntries(children, headingTag);
        if (!entries.length) return;

        // Nodes before the first heading (e.g. a leading "Free Energy
        // playlist" reference line) -- pulled out into their own block, shown
        // above the toggle in both views, instead of getting buried inside
        // whichever view is currently hidden.
        var firstHeadingIndex = -1;
        for (var ci = 0; ci < children.length; ci++) {
          if (children[ci].tagName === headingTag) { firstHeadingIndex = ci; break; }
        }
        var leadNodes = firstHeadingIndex > 0 ? children.slice(0, firstHeadingIndex) : [];
        var restNodes = firstHeadingIndex >= 0 ? children.slice(firstHeadingIndex) : children;

        var thumbView = document.createElement('div');
        thumbView.className = 'thumb-view view-hidden';
        restNodes.forEach(function (node) { thumbView.appendChild(node); });

        var gridView = document.createElement('div');
        gridView.className = 'card-grid';
        entries.forEach(function (entry) {
          var link = firstMatch(entry.nodes, 'a');
          if (!link) return;
          var img = firstMatch(entry.nodes, 'img');
          var card = document.createElement('a');
          card.className = 'link-card';
          card.href = link.getAttribute('href');
          var thumb = document.createElement('span');
          thumb.className = 'link-card-thumb';
          var src = img && img.getAttribute('src');
          if (src) thumb.style.backgroundImage = cssUrl(src);
          var cardBody = document.createElement('span');
          cardBody.className = 'link-card-body';
          var titleEl = document.createElement('span');
          titleEl.className = 'link-card-title';
          titleEl.textContent = entry.title;
          var cta = document.createElement('span');
          cta.className = 'link-card-readmore';
          cta.textContent = 'Watch →';
          cardBody.appendChild(titleEl);
          cardBody.appendChild(cta);
          card.appendChild(thumb);
          card.appendChild(cardBody);
          gridView.appendChild(card);
        });
        if (!gridView.children.length) return;

        var gridWrap = document.createElement('div');
        gridWrap.className = 'card-grid-breakout';
        gridWrap.appendChild(gridView);

        var toolbar = document.createElement('div');
        toolbar.className = 'view-toggle';
        var thumbBtn = document.createElement('button');
        thumbBtn.type = 'button';
        thumbBtn.className = 'view-toggle-btn';
        thumbBtn.textContent = 'Thumbnail View';
        var gridBtn = document.createElement('button');
        gridBtn.type = 'button';
        gridBtn.className = 'view-toggle-btn active';
        gridBtn.textContent = 'Grid View';
        toolbar.appendChild(thumbBtn);
        toolbar.appendChild(gridBtn);

        if (leadNodes.length) {
          var leadWrap = document.createElement('div');
          leadWrap.className = 'grid-toggle-lead';
          leadNodes.forEach(function (node) { leadWrap.appendChild(node); });
          list.appendChild(leadWrap);
        }
        list.appendChild(toolbar);
        list.appendChild(thumbView);
        list.appendChild(gridWrap);

        breakouts.push(gridWrap);
        updateBreakout(gridWrap);

        function showThumb() {
          thumbBtn.classList.add('active');
          gridBtn.classList.remove('active');
          thumbView.classList.remove('view-hidden');
          gridWrap.classList.add('view-hidden');
        }
        function showGrid() {
          gridBtn.classList.add('active');
          thumbBtn.classList.remove('active');
          gridWrap.classList.remove('view-hidden');
          thumbView.classList.add('view-hidden');
          // Re-measure: the viewport (or the chapter's own collapsed state)
          // may have changed while this grid was hidden.
          updateBreakout(gridWrap);
        }
        thumbBtn.addEventListener('click', showThumb);
        gridBtn.addEventListener('click', showGrid);
      }

      GRID_VIEW_CHAPTERS.forEach(enableGridToggle);
    })();
  </script>

  <script>
    // image-lightbox: click any post-body image to pop it out spanning the full browser
    // width, with prev/next navigation via on-screen arrows and keyboard arrow keys. This
    // is a fixed full-viewport overlay (not an in-flow width breakout), so it always sits
    // on top of the page -- no AdSense placement can end up sandwiched above or below it
    // while it's open.
    (function () {
      var images = Array.prototype.slice.call(document.querySelectorAll('.post-body img'));
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

      function nudgeSideRail() {
        // Same trick as the video theater-mode toggle: AdSense only re-checks
        // google-side-rail-overlap exclusion zones on scroll/resize, not on a
        // plain class-driven visibility change.
        setTimeout(function () {
          window.dispatchEvent(new Event('resize'));
        }, 50);
      }

      // adGuard: the z-index/exclusion-zone approach above doesn't reliably
      // keep AdSense's side-rail Auto ads format off the lightbox in practice
      // -- Google appears to re-append that ad node later in the DOM, which
      // wins the stacking-order tie even against a matching max z-index. So
      // while the lightbox is open, directly hide any Auto ads in-page block
      // (the same google-auto-placed class the other mirrored-article pages'
      // header/comments guard watches for) and restore it on close. A
      // MutationObserver catches one that gets (re)inserted while the
      // lightbox is already open.
      var AD_SELECTOR = '.google-auto-placed';
      var adGuardObserver = null;

      function hideAd(el) {
        if (el.dataset.lbPrevDisplay === undefined) {
          el.dataset.lbPrevDisplay = el.style.display || '';
        }
        el.style.setProperty('display', 'none', 'important');
      }

      function restoreAds() {
        document.querySelectorAll(AD_SELECTOR).forEach(function (el) {
          if (el.dataset.lbPrevDisplay !== undefined) {
            el.style.display = el.dataset.lbPrevDisplay;
            delete el.dataset.lbPrevDisplay;
          }
        });
      }

      function startAdGuard() {
        document.querySelectorAll(AD_SELECTOR).forEach(hideAd);
        adGuardObserver = new MutationObserver(function (mutations) {
          mutations.forEach(function (m) {
            m.addedNodes.forEach(function (node) {
              if (node.nodeType !== 1) return;
              if (node.matches && node.matches(AD_SELECTOR)) hideAd(node);
              if (node.querySelectorAll) node.querySelectorAll(AD_SELECTOR).forEach(hideAd);
            });
          });
        });
        adGuardObserver.observe(document.body, { childList: true, subtree: true });
      }

      function stopAdGuard() {
        if (adGuardObserver) {
          adGuardObserver.disconnect();
          adGuardObserver = null;
        }
        restoreAds();
      }

      function open(index) {
        show(index);
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        nudgeSideRail();
        startAdGuard();
      }

      function close() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        nudgeSideRail();
        stopAdGuard();
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

<!-- PAGEVIEW-TRACKING-INSERTED --><script src="/main_js/track.js" defer></script></body>
</html>
`;
}

async function main() {
  console.log(`Fetching @${AUTHOR}/${PERMLINK} from api.hive.blog ...`);
  const post = await fetchPost();
  console.log(`Got post: "${post.title}" (${post.stats?.total_votes ?? 0} votes, ${post.children ?? 0} comments, ${post.reblogs ?? 0} reblogs)`);

  console.log(`Resolving card metadata for ${POSTS_AND_UPDATES.length + VIDEOS.length} links ...`);
  const meta = await resolveAllMeta([...POSTS_AND_UPDATES, ...VIDEOS]);

  const html = buildPage(post, meta);
  const outPath = join(__dirname, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
