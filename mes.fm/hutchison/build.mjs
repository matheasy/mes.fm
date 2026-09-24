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

// Lazy-load remote post images (mirrors optimize_pagespeed.py's transform_images
// lazy-loading pass, part 5, applied to the whole generated page here so a
// rebuild doesn't silently undo it): every <img> whose src is a non-mes.fm
// http(s) URL gets loading="lazy", except the first "real" (non-data:) image
// on the page, which stays eager so it doesn't delay LCP.
const IMG_TAG_RE = /<img\b[^>]*?\/?>/gi;

function imgAttr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

function addImageLazyLoading(html) {
  const imgs = [...html.matchAll(IMG_TAG_RE)];
  if (imgs.length === 0) return html;

  let firstReal = -1;
  for (let idx = 0; idx < imgs.length; idx++) {
    const s = imgAttr(imgs[idx][0], "src");
    if (s && !s.trim().startsWith("data:")) {
      firstReal = idx;
      break;
    }
  }

  let out = "";
  let last = 0;
  imgs.forEach((m, idx) => {
    const tag = m[0];
    let newTag = tag;
    const src = imgAttr(tag, "src");
    if (
      src &&
      idx !== firstReal &&
      /^https?:\/\//i.test(src.trim()) &&
      !src.includes("mes.fm") &&
      !/\bloading\s*=/i.test(tag)
    ) {
      newTag = tag.replace(/^<img\b/i, '<img loading="lazy"');
    }
    out += html.slice(last, m.index) + newTag;
    last = m.index + tag.length;
  });
  out += html.slice(last);
  return out;
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
    .replace(/\s*[-–—,;:]*\s*mirrored from the hive blockchain.*$/i, "")
    .replace(/\s*[-–—,;:]*\s*mirrored from hive.*$/i, "")
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
  { href: "https://mes.fm/hutchison-article-balloons", title: "John Hutchison's First Newspaper Appearance: Balloons Over Grouse Mountain" },
  { href: "https://mes.fm/hutchison-health-sept6-2026", title: "John Hutchison is coming home — health update" },
  { href: "https://mes.fm/hutchison-health-sept5-2026", title: "Prayers up for John Hutchison, again — health update" },
  { href: "https://mes.fm/bought-911-hutchison-shirt", title: "Someone bought a 9/11 DJW Book shirt and Hutchison Effect shirt" },
  { href: "https://mes.fm/hutchison-health-aug22-2026", title: "Prayers up for John Hutchison — health update" },
];

const VIDEOS = [
  { href: "https://mes.fm/hutchison-levitating-can-live", title: "Hutchison Effect: Plastic Can Levitates and Video is Played Back LIVE" },
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
    `${title} — an index of every MES Hutchison Effect video and article, with thumbnails and links, mirrored from the Hive blockchain.`;
  // A curated comparison photo (twisted Hutchison Effect wrench next to the
  // WTC steel memorial sculpture) rather than the Hive post's own lead
  // image, so link previews show the page's actual hook instead of
  // whatever happened to be the first <img> in the article.
  const ogImage = "https://mes.fm/img/hutchison-logo-big.jpg";
  const ogImageTag = `\n  <meta property="og:image" content="${ogImage}">`;
  const twitterImageTag = `\n  <meta name="twitter:image" content="${ogImage}">`;
  const buildDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // NOTE: the lightbox-zoom CSS/JS (LIGHTBOX-ZOOM-INSERTED) and the deferred-
  // AdSense loader (ADSENSE-DEFERRED) below are manually kept in sync with
  // add_lightbox_zoom.py and optimize_pagespeed.py's transform_adsense_defer,
  // and the brand-blue accent below matches optimize_pagespeed.py's
  // transform_contrast (#277bb6/#346689). Those repo-wide scripts patch
  // generated index.html files directly and never touch build.mjs sources,
  // so `npm run build` would otherwise silently regress this page back to
  // unzoomed images, synchronous AdSense, and under-contrast blue. If any of
  // those scripts' templates change, update the matching block here too.

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
  <link rel="icon" href="https://mes.fm/img/hutchison-logo.jpg?v=1.0" type="image/jpeg" />
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
      position: relative;
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

    /* Site-wide header chrome -- same markup/behaviour as mes.fm/math,
       mes.fm/911 and mes.fm/science, in Hutchison's own purple accent
       (#6a3fa0 light / #b98aff dark). */
    .site-brand { display: flex; align-items: center; gap: 1.5em; min-width: 0; }
    .site-brand-logo-link { display: block; flex: 0 0 auto; }
    .site-brand-logo { display: block; width: 88px; height: 88px; border-radius: 0.35em; flex: 0 0 auto; object-fit: cover; }
    .site-brand-text { min-width: 0; }
    .site-brand-title { display: block; font-size: 1.8em; font-weight: 400; line-height: 1.15; margin-bottom: 0.3em; text-decoration: none; }
    .site-brand-tag { font-size: 1.2em; margin: 0; line-height: 1.3; }
    body.light .site-brand-title { color: #222222; }
    body.dark .site-brand-title { color: #eeeeee; }
    body.light .site-brand-tag { color: #555555; }
    body.dark .site-brand-tag { color: #b8b8b8; }
    .header-controls { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; margin-left: auto; }
    .header-icon-btn {
      flex: 0 0 auto; width: 2.2em; height: 2.2em; padding: 0; border-radius: 50%;
      cursor: pointer; font-family: inherit; font-size: 0.85em; font-weight: 700; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      border: 1.5px solid rgba(0, 0, 0, 0.15); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
    .header-icon-btn:disabled { opacity: 0.4; cursor: default; }
    body.light .header-icon-btn { background-color: #3a3d52; color: #ffffff; border-color: rgba(255, 255, 255, 0.35); }
    body.dark .header-icon-btn { background-color: #2e2e2e; color: #eeeeee; border-color: rgba(255, 255, 255, 0.25); }
    @media (max-width: 600px) { .site-brand { gap: 0.75em; } .site-brand-logo { width: 64px; height: 64px; } .site-brand-tag { font-size: 0.95em; } .site-brand-title { font-size: 1.3em; } }

    /* Shared mes.fm site navigation: hamburger + dropdown (#navbar-button /
       #navbar, toggled by /main_js/main.js) and the primary nav bar
       (#info-bar), same markup/behaviour as mes.fm/math and mes.fm/911.
       Colors are set on #id selectors so the body.light/body.dark "a" color
       rules don't win. */
    .hamburger-btn {
      flex: 0 0 auto; width: 44px; height: 44px; padding: 0; margin: 0 0 0 4px;
      background: transparent; border: none; cursor: pointer; font-size: 0;
    }
    .hamburger-btn::before {
      content: ""; display: block; margin: 0 auto;
      width: 26px; height: 4px; background: currentColor; border-radius: 1px;
      box-shadow: 0 7px 0 currentColor, 0 -7px 0 currentColor;
    }
    body.light .hamburger-btn { color: #6a3fa0; }
    body.dark .hamburger-btn { color: #b98aff; }
    #navbar { display: none; }
    #navbar.hide {
      display: flex; flex-direction: column; box-sizing: border-box;
      position: absolute; top: 100%; right: 0; z-index: 30;
      width: 16em; max-width: 90vw; max-height: 75vh; overflow-y: auto;
      background-color: #6a3fa0; border-radius: 0.25em;
      box-shadow: 0 0.25em 1em rgba(0, 0, 0, 0.3);
      list-style: none; margin: 0; padding: 0;
    }
    #navbar li, #info-bar { list-style: none; margin: 0; padding: 0; }
    #navbar .navbar__item:hover { cursor: pointer; }
    #navbar .navbar__link { display: block; color: #ffffff; padding: 0.7em 1em 0.7em 1.4em; text-decoration: none; }
    #navbar .navbar__link--first { padding-top: 0.8em; }
    #navbar .navbar__link:hover:not(.navbar__dropdown-item):not(.active-tab) { background-color: #522f80; }
    #navbar .dropdown-symbol { margin-left: 1em; color: #ffffff; }
    #navbar .navbar__dropdown-container { background-color: #d8e9f8; margin: 0; padding: 0; }
    #navbar .navbar__dropdown-container.hide { display: none; }
    #navbar .navbar__dropdown-item { color: #222222; }
    #navbar .navbar__dropdown-item:hover { text-decoration: underline; }
    #navbar .navbar__item--social { order: 999; padding: 1em 1.6em 1em 1.4em; border-top: 1px solid rgba(255, 255, 255, 0.25); }
    #navbar .social-container { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6em; }
    #navbar .social__text { color: #ffffff; margin: 0; font-style: italic; }
    #navbar .social { display: flex; flex-wrap: wrap; gap: 0.5em; margin: 0; padding: 0; list-style: none; }
    .social__link { height: 2em; width: 2em; display: block; }
    .social__fb { background: url(/main_img/social-sprites.png) 0 0; }
    .social__insta { background: url(/main_img/social-sprites.png) -4em 0; }
    .social__pin { background: url(/main_img/social-sprites.png) -6em 0; }
    .social__twitter { background: url(/main_img/social-sprites.png) -8em 0; }
    .social__yt { background: url(/main_img/social-sprites.png) -10em 0; }
    .social__patreon { background: url(/main_img/social-sprites.png) -12em 0; }
    .social__hive { background: url(/main_img/social-sprites.png) -16em 0; }
    .social__telegram { background: url(/main_img/social-sprites.png) -18em 0; }
    #navbar .navbar__link.active-tab, #info-bar .info-bar__item__text.active-tab { background-color: #d8e9f8; color: #222222; }

    .info-bar-container { margin-top: 12px; }
    .info-bar { display: flex; flex-wrap: wrap; background-color: #6a3fa0; box-shadow: 0.2em 0.2em 0.5em rgba(0, 0, 0, 0.35); }
    #info-bar .info-bar__item__text { display: block; text-align: center; padding: 0.7em 1em; font-size: 0.9em; color: #ffffff; text-decoration: none; }
    #info-bar .info-bar__item__text:hover:not(.active-tab) { background-color: #522f80; }
    @media (max-width: 600px) {
      .info-bar { justify-content: center; }
      #info-bar .info-bar__item__text { min-height: 44px; display: flex; align-items: center; }
    }

    /* Site footer -- same links/markup as mes.fm/math, in the Hutchison purple
       accent. Colors use ".footer .x" (0,2,0) so the body.light/body.dark "a"
       rules don't win. */
    .footer { max-width: 1180px; margin: 2.5em auto 0; padding: 2em; background-color: #6a3fa0; border-radius: 0.35em; }
    .footer__item-container { display: table; width: 100%; margin-bottom: 1.6em; }
    .footer__item { display: table-cell; }
    .footer__item--extra-padding { padding-left: 2.5em; }
    .footer .footer__text { color: #ffffff; line-height: 1.5; text-decoration: none; }
    .footer .footer__text--title { display: inline-block; margin-bottom: 1.6em; font-size: 1.3em; font-style: italic; }
    .footer__text--extra-info { float: right; }
    .footer .footer__text:not(.footer__text--copyright):hover { text-decoration: underline; cursor: pointer; }
    .footer__separator, #copyright-year { color: #ffffff; }
    @media (max-width: 600px) {
      .footer { padding: 1.25em 0.75em; }
      .footer__item-container { display: block; }
      .footer__item { display: block; margin-bottom: 0.75em; }
      .footer__item--extra-padding { padding-left: 0; }
      .footer__text--extra-info { float: none; display: block; margin-top: 0.5em; }
    }

    /* Floating compact header bar: once the real top-bar + nav scroll out of
       view, a slim fixed bar (small logo, title, as many nav links as fit)
       slides in, and the header-controls + hamburger are pinned into its
       right end. Ported from mes.fm/911's version (see its build.mjs) --
       this page's top-bar is already a clean flex row, same as the Vector
       Functions: Problems Plus family. Uses Hutchison's own purple accent.

       Hidden by default via the inline style="display:none" on the element
       itself (not just this stylesheet's "display: none" below) -- some
       browser extensions strip or neutralize cosmetic-looking CSS for
       elements named "sticky-*"/"*-bar" (a common ad/cookie-bar filter
       pattern), which left an earlier version's raw unstyled markup visible
       above the real header on mes.fm/math. The inline attribute is a
       fallback the JS clears itself, independent of this stylesheet
       surviving intact. */
    #compact-nav {
      position: fixed; top: 0; left: 0; right: 0; height: 52px; z-index: 15;
      display: none; align-items: center; gap: 12px;
      padding: 0 172px 0 12px; box-sizing: border-box;
      background: #ffffff; border-bottom: 3px solid #6a3fa0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      transform: translateY(-110%); transition: transform 0.2s ease;
    }
    #compact-nav.is-visible { display: flex; }
    body.is-stuck #compact-nav { transform: none; }
    #compact-nav .compact-nav-logo { display: block; width: 32px; height: 32px; border-radius: 6px; flex: 0 0 auto; object-fit: cover; }
    #compact-nav .compact-nav-title {
      flex: 0 1 auto; min-width: 0; font-weight: 700; font-size: 1.05em;
      text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #compact-nav .compact-nav-links { display: flex; flex: 1 1 0; min-width: 0; overflow: hidden; margin: 0 0 0 8px; padding: 0; list-style: none; }
    #compact-nav .compact-nav-links li { flex: 0 0 auto; }
    #compact-nav .compact-nav-links a { display: block; padding: 0 10px; line-height: 52px; font-size: 0.9em; text-decoration: none; white-space: nowrap; }
    #compact-nav .compact-nav-links a:hover { background: rgba(106,63,160,0.12); }
    body.light #compact-nav .compact-nav-title { color: #1a1a1a; }
    body.dark #compact-nav { background: #1a1a1a; }
    body.dark #compact-nav .compact-nav-title { color: #eeeeee; }
    body.light #compact-nav .compact-nav-links a { color: #6a3fa0; }
    body.dark #compact-nav .compact-nav-links a { color: #b98aff; }
    /* z-index:20 here (and below) beats #compact-nav's z-index:15 -- without
       it these fixed-position controls paint (and hit-test) underneath the
       bar once stuck, making the hamburger both invisible and unclickable. */
    body.is-stuck .header-controls { position: fixed !important; top: 13px; right: 60px; margin-left: 0; z-index: 20; }
    body.is-stuck #navbar-button { position: fixed !important; top: 4px !important; right: 8px !important; margin: 0; z-index: 20; }
    body.is-stuck #navbar.hide { position: fixed; top: 56px; right: 8px; }
    @media (max-width: 700px) {
      #compact-nav .compact-nav-title { display: none; }
      #compact-nav .compact-nav-logo { width: 36px; height: 36px; }
    }
    @media (max-width: 480px) {
      #compact-nav { padding-right: 160px; gap: 8px; }
      body.is-stuck .header-controls { right: 56px; }
    }

    h1 {
      font-size: 2em;
      margin: 0.4em 0 0.2em;
    }

    /* Text-size control (--ts, set by the header A-/A+ buttons): only prose,
       the lede, byline and Jump To navigation scale; headings, chapter
       titles, cards and buttons stay fixed. rem so nested lists don't
       compound. */
    .post-body :is(p, li, blockquote, td, th):not(.card-grid *) { font-size: calc(1rem * var(--ts, 1)); }

    .post-meta {
      font-size: calc(0.9rem * var(--ts, 1));
      opacity: 0.85;
      margin-bottom: 0.6em;
    }

    .post-meta span:not(:last-child)::after {
      content: " \\00b7 ";
    }

    .peakd-link {
      display: inline-block;
      margin: 0.6em 0 1.4em;
      font-size: calc(0.9rem * var(--ts, 1));
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
      border-left: 3px solid #277bb6;
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
        padding-right: 10px;
        scrollbar-width: thin;
        scrollbar-color: rgba(128, 128, 128, 0.4) transparent;
      }

      /* toc-sidebar-scrollbar */
      .toc-sidebar::-webkit-scrollbar {
        width: 6px;
      }

      .toc-sidebar::-webkit-scrollbar-track {
        background: transparent;
      }

      .toc-sidebar::-webkit-scrollbar-thumb {
        background: rgba(128, 128, 128, 0.4);
        border-radius: 3px;
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
      font-size: calc(1rem * var(--ts, 1));
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
    /* LIGHTBOX-ZOOM-INSERTED */
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

    #lightboxImage {
      transition: transform 0.15s ease;
    }

    #lightboxImage.zoomed {
      cursor: grab;
    }

    #lightboxImage.dragging {
      cursor: grabbing;
      transition: none;
    }

    @media (max-width: 600px) {
      .lightbox-zoom-btn { width: 36px; height: 36px; font-size: 1.05em; }
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
</head>
<body class="dark">
  <div id="compact-nav" aria-hidden="true" style="display:none">
  <a href="/hutchison" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="https://mes.fm/img/hutchison-logo.jpg"></a>
  <a class="compact-nav-title" href="/hutchison" tabindex="-1">MES Hutchison Effect</a>
  <ul class="compact-nav-links">
    <li><a href="/math" tabindex="-1">Math Tutorials</a></li>
    <li><a href="/calculators" tabindex="-1">Calculators</a></li>
    <li><a href="/tools" tabindex="-1">Tools</a></li>
    <li><a href="/mobile-apps" tabindex="-1">Mobile Apps</a></li>
    <li><a href="/puzzles" tabindex="-1">Puzzles</a></li>
    <li><a href="/memes" tabindex="-1">Memes</a></li>
    <li><a href="/" tabindex="-1"><b>MES.fm</b></a></li>
  </ul>
</div>

  <nav class="toc-sidebar" aria-label="Table of contents">
    <div class="toc-sidebar-header">
      <div class="toc-title">Jump to</div>
      <button type="button" class="toc-collapse-all-btn toggle-all-chapters-btn" onclick="toggleAllChapters()">Collapse All</button>
    </div>
      ${tocLinksHtml}
  </nav>
  <div class="wide">
    <div class="top-bar">
      <div class="site-brand">
        <a class="site-brand-logo-link" href="/hutchison"><img class="site-brand-logo" src="/img/hutchison-logo.jpg" width="88" height="88" alt="MES Hutchison Effect logo"></a>
        <div class="site-brand-text"><a class="site-brand-title" href="/hutchison">MES Hutchison Effect</a><p class="site-brand-tag">Antigravity, materials transmutation, and John Hutchison's demonstrations.</p></div>
      </div>
      <div class="header-controls">
        <button id="textSizeDown" class="header-icon-btn" type="button" aria-label="Decrease text size" title="Decrease text size">A&minus;</button>
        <button id="textSizeUp" class="header-icon-btn" type="button" aria-label="Increase text size" title="Increase text size">A+</button>
        <button id="themeToggle" class="header-icon-btn" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">&#127769;</button>
      </div>
      <button id="navbar-button" class="hamburger-btn" type="button" aria-label="Site navigation" aria-haspopup="true"></button>
      <ul id="navbar" class="navbar" role="navigation" aria-label="Site menu">
        <li class="navbar__item navbar__item--social"><div class="social-container"><p class="social__text">Follow us!</p><ul class="social">
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
        <li class="navbar__item"><a target="_self" class="navbar__link" href="/hutchison">Hutchison Effect</a></li>
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
        <li class="navbar__item"><a target="_blank" class="navbar__link" href="https://teespring.com/stores/mes-store">Store</a></li>
        <li class="navbar__item"><a target="_blank" rel="nofollow" class="navbar__link" href="https://matheasy.substack.com/">Subscribe</a></li>
        <li class="navbar__item"><a target="_blank" class="navbar__link" href="/donate">Donate</a></li>
        <li class="navbar__item"><a class="navbar__link" href="/contact">Contact Us</a></li>
      </ul>
    </div>
    <div class="info-bar-container" role="navigation" aria-label="Primary">
      <ul id="info-bar" class="info-bar">
        <li class="info-bar__item"><a target="_self" class="info-bar__item__text" href="/hutchison">Hutchison Effect</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" target="_blank" rel="nofollow" href="https://matheasy.substack.com/">Subscribe</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" target="_blank" href="https://teespring.com/stores/mes-store">Store</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" target="_blank" href="/donate">Donate</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" href="/contact">Contact Us</a></li>
        <li class="info-bar__item info-bar__item--mes"><a class="info-bar__item__text" href="/" style="font-weight:bold;">MES.fm</a></li>
      </ul>
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

  <div class="lightbox-overlay" id="lightboxOverlay" google-side-rail-overlap="false" role="dialog" aria-modal="true" aria-label="Image viewer">
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
        themeToggle.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
      } else {
        body.classList.add('light');
        body.classList.remove('dark');
        themeToggle.textContent = '🌙';
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
    // text-size control: same STEPS / 'articleFontScale' key as
    // add_text_size_control.py and mes.fm/math. Drives the --ts CSS variable,
    // which only prose (paragraphs/lists/tables), the byline and the Jump To
    // navigation multiply into their font-size -- headings, chapter titles
    // ("Hutchison Effect Playlist"), cards and buttons stay fixed.
    (function () {
      var STEPS = [87.5, 100, 112.5, 125, 137.5, 150];
      var body = document.body;
      var downBtn = document.getElementById('textSizeDown');
      var upBtn = document.getElementById('textSizeUp');
      if (!body || !downBtn || !upBtn) return;
      var index;
      try { index = STEPS.indexOf(parseFloat(localStorage.getItem('articleFontScale'))); } catch (e) { index = -1; }
      if (index === -1) index = STEPS.indexOf(100);
      function apply() {
        body.style.setProperty('--ts', String(STEPS[index] / 100));
        downBtn.disabled = index === 0;
        upBtn.disabled = index === STEPS.length - 1;
        try { localStorage.setItem('articleFontScale', String(STEPS[index])); } catch (e) {}
      }
      downBtn.addEventListener('click', function () { index = Math.max(0, index - 1); apply(); });
      upBtn.addEventListener('click', function () { index = Math.min(STEPS.length - 1, index + 1); apply(); });
      apply();
    })();
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
  <script>document.getElementById('copyright-year').textContent = new Date().getFullYear();</script>
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/1.11.3/jquery.min.js"></script>
  <script>var MES_Vars = { mobile: false, hide_search: false, current_tab: 1, info_bar_tab: 0 };</script>
  <script src="/main_js/main.js?v=1.0.3"></script>
<script>
    // lightbox-zoom: adds +/- zoom and drag-to-pan on top of the existing
    // image lightbox. Purely additive -- it only touches the #lightboxZoom*
    // elements it creates itself, resetting whenever #lightboxImage's src
    // or #lightboxOverlay's open state changes, so it works the same
    // regardless of how this page's own lightbox open/prev/next logic runs.
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
  </script><!-- PAGEVIEW-TRACKING-INSERTED --><script src="/main_js/track.js" defer></script><script src="/main_js/info-bar-fit.js" defer></script><script>
  // Floating compact header bar (see #compact-nav CSS): appears once the
  // header + nav bar have scrolled off the top; nav links that don't fit
  // are dropped from the right, least important first, rather than
  // wrapping. The last link (MES.fm) is kept longest, so drop from the one
  // before it first. Visibility is driven from here via the inline style
  // attribute (not just a CSS class) so the bar stays hidden even if the
  // stylesheet rules for it get stripped -- see the CSS comment above
  // #compact-nav. Identical to mes.fm/math's version.
  (function () {
    var bar = document.getElementById('compact-nav');
    var nav = document.querySelector('.info-bar-container');
    var links = bar && bar.querySelector('.compact-nav-links');
    if (!bar || !nav || !links) return;
    var items = Array.prototype.slice.call(links.children);
    var stuck = false, ticking = false, hideTimer;

    function fit() {
      items.forEach(function (li) { li.style.display = ''; });
      var order = items.slice(0, -1).reverse();
      for (var i = 0; i < order.length && links.scrollWidth > links.clientWidth; i++) {
        order[i].style.display = 'none';
      }
      if (links.scrollWidth > links.clientWidth) items[items.length - 1].style.display = 'none';
    }

    function update() {
      ticking = false;
      var now = nav.getBoundingClientRect().bottom < 0;
      if (now === stuck) return;
      stuck = now;
      bar.setAttribute('aria-hidden', stuck ? 'false' : 'true');
      Array.prototype.forEach.call(bar.querySelectorAll('a'), function (a) {
        a.tabIndex = stuck ? 0 : -1;
      });
      if (stuck) {
        clearTimeout(hideTimer);
        bar.style.display = 'flex';
        fit();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { document.body.classList.add('is-stuck'); });
        });
      } else {
        document.body.classList.remove('is-stuck');
        hideTimer = setTimeout(function () { bar.style.display = 'none'; }, 220);
      }
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', function () { if (stuck) fit(); });
    update();
  })();
</script>
</body>
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
  writeFileSync(outPath, addImageLazyLoading(html), "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
