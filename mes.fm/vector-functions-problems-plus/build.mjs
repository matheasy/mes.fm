// Build-time generator for mes.fm/vector-functions-problems-plus.
//
// Fetches @mes/review-of-vector-functions-138 from Hive's public bridge API and
// writes a static index.html. This is NOT run by Vercel -- run it manually
// (`npm run build`) whenever the Hive article changes, then commit index.html.
//
// Combines two earlier scaffolds:
//   * mes.fm/911-alchemy  -- bare 3Speak / YouTube URLs become Theater-Mode
//     video embeds (3Speak plays its HLS manifest directly via hls.js, resolved
//     at build time).
//   * mes.fm/hutchison + mes.fm/911 -- every top-level "# " heading becomes a
//     collapsible chapter with a "Collapse All" toolbar and a "Jump to" table of
//     contents (fixed sidebar on wide viewports, <details> dropdown otherwise).
//
// Usage:
//   npm install
//   npm run build

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AUTHOR = "mes";
const PERMLINK = "vector-functions-problems-p-729";
const COMMUNITY = "hive-128780";
const PEAKD_URL = `https://peakd.com/${COMMUNITY}/@${AUTHOR}/${PERMLINK}`;
const CANONICAL = "https://mes.fm/vector-functions-problems-plus";
const BACK_LINK = "https://mes.fm/links";

// Guard against pointing PERMLINK at the wrong article. MES's Hive posts link
// back to their own mes.fm page (e.g. "[Notes](https://mes.fm/<slug>)"), so if
// the fetched article's body never mentions this page's CANONICAL url, PERMLINK
// and CANONICAL have most likely drifted apart -- warn loudly. Set
// ALLOW_SLUG_MISMATCH=1 to build anyway (e.g. a brand-new post that doesn't
// self-reference yet).
function checkSlugMatch(post) {
  const slug = CANONICAL.replace(/^https?:\/\//, "");
  const ok = post.body.includes(CANONICAL) || post.body.includes(slug);
  console.log(
    `Slug check: @${AUTHOR}/${PERMLINK} "${post.title}" -> ${CANONICAL} ${
      ok ? "(OK — article self-references this page)" : "(NO self-reference found)"
    }`
  );
  if (!ok && process.env.ALLOW_SLUG_MISMATCH !== "1") {
    throw new Error(
      `\n\n  ⚠  SLUG MISMATCH\n` +
        `  The article @${AUTHOR}/${PERMLINK} ("${post.title}")\n` +
        `  does not link back to ${CANONICAL} anywhere in its body.\n` +
        `  PERMLINK and CANONICAL are probably out of sync -- double-check the Hive URL.\n` +
        `  Re-run with ALLOW_SLUG_MISMATCH=1 to build anyway.\n`
    );
  }
}

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

async function fetchPost() {
  const result = await hiveCall("bridge.get_post", { author: AUTHOR, permlink: PERMLINK });
  if (!result || !result.body) {
    throw new Error("Hive API returned no post — check author/permlink.");
  }
  return result;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(isoString) {
  return new Date(isoString + "Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ipfsToGateway(uri) {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs-3speak.b-cdn.net/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}

// A bare 3Speak URL resolves to its direct HLS manifest so we can play it in a
// plain <video> (native speed/quality/PiP controls) instead of iframing 3speak.tv.
// Try 3Speak's public embed API first; if that 404s (older permlinks aren't all
// indexed), fall back to the 3Speak video's own Hive post metadata, which carries
// the IPFS manifest hash. Re-encodes / re-uploads keep the permlink, so re-running
// this build picks them up.
async function resolve3Speak(owner, permlink) {
  try {
    const res = await fetch(`https://play.3speak.tv/api/embed?v=${owner}/${permlink}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.videoUrl) {
        return { src: data.videoUrl, poster: data.thumbnail || null };
      }
    }
  } catch {
    /* fall through to Hive metadata */
  }

  try {
    const post = await hiveCall("condenser_api.get_content", [owner, permlink]);
    const meta = JSON.parse(post.json_metadata || "{}");
    const info = (meta.video && meta.video.info) || {};
    const sourceMap = info.sourceMap || [];
    const manifest =
      info.video_v2 ||
      (sourceMap.find((s) => s.type === "video" && s.format === "m3u8") || {}).url ||
      null;
    const thumb = (sourceMap.find((s) => s.type === "thumbnail") || {}).url;
    const poster =
      (Array.isArray(meta.image) && meta.image[0]) || ipfsToGateway(thumb) || null;

    if (manifest && manifest.startsWith("ipfs://")) {
      const gateway = ipfsToGateway(manifest);
      return {
        src: `https://play.3speak.tv/hls?u=${encodeURIComponent(gateway)}`,
        poster,
      };
    }
    if (manifest) return { src: manifest, poster };
  } catch {
    /* best effort */
  }

  return { src: null, poster: null };
}

// Bare 3Speak URLs on their own line (PeakD renders these as an embedded player).
// Each becomes a <video> with a unique id; the {id, src} pairs get wired up by a
// script block once hls.js has loaded. Anchored to a whole line (^...$) so it
// only touches standalone embeds, never the same URL inside a "[3Speak](...)"
// link in a link row.
async function embed3SpeakLinks(markdown) {
  const pattern =
    /^[ \t]*https?:\/\/(?:play\.)?3speak\.tv\/(?:watch|embed)\?v=([\w.-]+)\/([\w.-]+)[ \t]*$/gm;
  const matches = [...markdown.matchAll(pattern)];
  const resolved = [];
  const videos = [];

  for (let i = 0; i < matches.length; i++) {
    const [, owner, permlink] = matches[i];
    const id = `speak-video-${i + 1}`;
    const { src, poster } = await resolve3Speak(owner, permlink);
    resolved.push({ id, owner, permlink, poster });
    videos.push({ id, src });
  }

  let idx = 0;
  const html = markdown.replace(pattern, () => {
    const { id, owner, permlink, poster } = resolved[idx++];
    const posterAttr = poster ? ` poster="${escapeHtml(poster)}"` : "";
    return (
      `<div class="video-embed" google-side-rail-overlap="false">` +
      `<video id="${id}" controls playsinline preload="metadata"${posterAttr}></video>` +
      `<button class="theater-toggle-btn" type="button" aria-pressed="false">Theater Mode</button>` +
      `<a class="video-badge" href="https://3speak.tv/watch?v=${owner}/${permlink}" target="_blank" rel="noopener">View on 3Speak &nearr;</a>` +
      `</div>`
    );
  });

  return { markdown: html, videos };
}

// Bare YouTube URLs on their own line become a responsive iframe embed, with the
// same Theater Mode toggle + badge as the 3Speak embeds above.
function embedYoutubeLinks(markdown) {
  return markdown.replace(
    /^[ \t]*(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)\S*[ \t]*$/gm,
    (_match, videoId) =>
      `<div class="video-embed" google-side-rail-overlap="false">` +
      `<iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>` +
      `<button class="theater-toggle-btn" type="button" aria-pressed="false">Theater Mode</button>` +
      `<a class="video-badge" href="https://youtu.be/${videoId}" target="_blank" rel="noopener">View on YouTube &nearr;</a>` +
      `</div>`
  );
}

// Give every top-level "# " heading (rendered as <h1>...</h1> by marked) an id
// and collect a {id, label} list so the table-of-contents can link to it.
// Duplicate slugs/labels get a "(2)"-style suffix to stay unique.
function addSectionAnchors(bodyHtml) {
  const seen = new Map();
  const toc = [];
  const html = bodyHtml.replace(/<h1>([\s\S]*?)<\/h1>/g, (match, inner) => {
    const plain = inner
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .trim();
    const slug =
      plain
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "section";
    const occurrence = (seen.get(slug) || 0) + 1;
    seen.set(slug, occurrence);
    const id = occurrence === 1 ? slug : `${slug}-${occurrence}`;
    const label = occurrence === 1 ? plain : `${plain} (${occurrence})`;
    toc.push({ id, label });
    return `<h1 id="${id}">${inner}</h1>`;
  });
  return { html, toc };
}

// Each chapter is preceded by its own "<hr>\n<h1 id=\"...\">" marker (added by
// addSectionAnchors) and runs until the next one (or the end of the body). Wrap
// each chapter's h1 + content in a chapter-toggle div so every chapter can be
// collapsed via toggleChapter(). The leading <hr> stays outside the div as the
// visual divider between chapters.
function wrapChaptersInToggles(html) {
  const re = /<hr>\n<h1 id="([^"]+)">([\s\S]*?)<\/h1>/g;
  const matches = [...html.matchAll(re)];
  if (matches.length === 0) return html;

  let out = html.slice(0, matches[0].index);
  matches.forEach((m, i) => {
    const [full, id, titleInner] = m;
    const contentStart = m.index + full.length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const content = html.slice(contentStart, contentEnd);
    // Some headings are "# <center>Title</center>" -- strip the wrapper so the
    // chapter header doesn't end up with a nested <center>.
    const cleanTitle = titleInner.replace(/^\s*<center>|<\/center>\s*$/g, "").trim();
    out += `<hr>\n<div class="chapter-toggle" id="${id}">\n`;
    out += `<h1 class="chapter-toggle-header" onclick="toggleChapter('${id}-list')"><center>${cleanTitle} <span id="arrowIcon-${id}-list" class="arrow-icon">&#9660;</span></center></h1>\n`;
    out += `<div id="${id}-list" class="chapter-toggle-list">${content}</div>\n`;
    out += `</div>\n`;
  });
  return out;
}

async function buildPage(post) {
  const title = post.title;
  const { markdown: withVideos, videos } = await embed3SpeakLinks(post.body);
  const preprocessed = embedYoutubeLinks(withVideos);
  const { html: parsedBodyHtml, toc } = addSectionAnchors(marked.parse(preprocessed));
  const wrappedBodyHtml = wrapChaptersInToggles(parsedBodyHtml);

  // Everything before the first "# " heading (the video, description, "Watch on"
  // row, timestamps, book references, topic list) becomes its own collapsible
  // "Overview" chapter, pinned above the article's own sections.
  toc.unshift({ id: "overview", label: "Overview" });
  const tocLinksHtml = toc
    .map((t) => `<a href="#${escapeHtml(t.id)}">${escapeHtml(t.label)}</a>`)
    .join("\n      ");

  const chaptersToolbar = `<div class="chapters-toolbar">
<button id="toggleAllChaptersBtn" class="theme-toggle-btn" onclick="toggleAllChapters()">Collapse All</button>
</div>
`;

  const firstChapterMatch = wrappedBodyHtml.match(/<hr>\n<div class="chapter-toggle" id="/);
  const leadingHtml = (firstChapterMatch
    ? wrappedBodyHtml.slice(0, firstChapterMatch.index)
    : wrappedBodyHtml
  ).trim();
  const restChaptersHtml = firstChapterMatch
    ? wrappedBodyHtml.slice(firstChapterMatch.index + "<hr>\n".length)
    : "";

  const overviewChapter = `<div class="chapter-toggle" id="overview">
<h1 class="chapter-toggle-header" onclick="toggleChapter('overview-list')"><center>Overview <span id="arrowIcon-overview-list" class="arrow-icon">&#9660;</span></center></h1>
<div id="overview-list" class="chapter-toggle-list">
${leadingHtml}
</div>
</div>
<hr>
`;

  const bodyHtml = chaptersToolbar + overviewChapter + restChaptersHtml;

  const publishedDate = formatDate(post.created);
  const voteCount = post.stats?.total_votes ?? 0;
  const commentCount = post.children ?? 0;
  const reblogCount = post.reblogs ?? 0;
  const buildDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const description =
    (post.json_metadata && post.json_metadata.description) ||
    "Review of the Vector Functions chapter from James Stewart's Calculus -- 9 Concept Check questions and a 14-question True-False Quiz, worked through with full solutions and video. Mirrored from the Hive blockchain.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="MES">
  <link rel="canonical" href="${CANONICAL}" />
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
      font-size: 1.3em;
      margin: 1.9em 0 0.4em;
    }

    .post-body h3 {
      font-size: 1.1em;
      margin: 1.6em 0 0.4em;
    }

    .post-body p {
      margin: 0 0 1em;
    }

    .post-body img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 0.6em 0;
      cursor: zoom-in;
    }

    .post-body ul {
      padding-left: 1.3em;
    }

    .post-body li {
      margin: 0 0 0.5em;
    }

    .post-body blockquote {
      border-left: 3px solid #5ea9dd;
      margin: 1em 0;
      padding: 0.2em 1em;
      opacity: 0.9;
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
      border-radius: 4px;
      overflow: hidden;
      margin: 0.6em 0 1.2em;
      transition: width 0.25s ease, max-width 0.25s ease, margin 0.25s ease,
        height 0.25s ease, padding-bottom 0.25s ease, border-radius 0.25s ease;
    }

    .video-embed iframe,
    .video-embed video {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
      background: #000;
    }

    .video-embed.theater-mode {
      width: 100vw;
      max-width: 100vw;
      left: 50%;
      margin-left: -50vw;
      margin-right: -50vw;
      padding-bottom: 0;
      height: min(85vh, 56.25vw);
      border-radius: 0;
      background: #000;
    }

    .video-embed.theater-mode iframe,
    .video-embed.theater-mode video {
      object-fit: contain;
    }

    .video-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      font-size: 0.8em;
      font-weight: bold;
      text-decoration: none;
      padding: 5px 10px;
      border-radius: 999px;
      z-index: 2;
    }

    .video-badge:hover {
      background: rgba(0, 0, 0, 0.85);
    }

    .theater-toggle-btn {
      position: absolute;
      top: 10px;
      left: 10px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(0, 0, 0, 0.7);
      color: #ffffff;
      font-size: 0.8em;
      font-weight: bold;
      border: 0;
      cursor: pointer;
      padding: 5px 10px;
      border-radius: 999px;
      z-index: 2;
    }

    .theater-toggle-btn:hover {
      background: rgba(0, 0, 0, 0.85);
    }

    .video-embed .video-badge,
    .video-embed .theater-toggle-btn {
      transition: opacity 0.3s ease;
    }

    .video-embed.controls-hidden .video-badge,
    .video-embed.controls-hidden .theater-toggle-btn {
      opacity: 0;
      pointer-events: none;
    }

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

    hr {
      margin: 2em 0;
      opacity: 0.3;
    }

    .source-link {
      display: inline-block;
      font-size: 0.9em;
      font-style: italic;
    }

    .retrieved-note {
      font-size: 0.85em;
      opacity: 0.7;
      margin-top: 0.4em;
    }

    .site-footer-note {
      font-size: 0.8em;
      opacity: 0.6;
      text-align: center;
    }

    /* Every chapter (the leading "Overview" one plus every Hive-sourced "# "
       section) is a collapsible dropdown -- see wrapChaptersInToggles() in
       build.mjs and toggleChapter() below. */
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
       above the first ("Overview") chapter. */
    .chapters-toolbar {
      display: flex;
      justify-content: flex-end;
      margin: -0.8em 0 0.4em;
    }

    /* Table of contents: a fixed side column on wide viewports, collapsing to a
       <details> dropdown above the article on anything narrower. */
    .toc-sidebar {
      display: none;
    }

    @media (min-width: 1300px) {
      .toc-sidebar {
        display: block;
        position: fixed;
        top: 90px;
        left: calc(50% + 410px);
        width: 210px;
        max-height: calc(100vh - 120px);
        overflow-y: auto;
        font-size: 0.85em;
      }

      .toc-sidebar .toc-title {
        font-size: 0.75em;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.6;
        margin: 0 0 0.7em;
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
    }

    @media (min-width: 1300px) {
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
    <div class="toc-title">Jump to</div>
      ${tocLinksHtml}
  </nav>
  <div class="container">
    <div class="top-bar">
      <a class="site-link" href="${BACK_LINK}">&larr; mes.fm/links</a>
      <button id="themeToggle" class="theme-toggle-btn">Loading...</button>
    </div>

    <h1>${escapeHtml(title)}</h1>
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

    <hr>

    <div class="post-body">
${bodyHtml}
    </div>

    <hr>

    <a class="source-link" href="${PEAKD_URL}" target="_blank" rel="noopener">Originally published on Hive &rarr;</a>
    <div class="retrieved-note">
      Vote/comment/reblog counts and article text were fetched from the Hive blockchain
      at build time (${escapeHtml(buildDate)}) and are not live.
    </div>
    <p class="site-footer-note"><a href="https://mes.fm/privacy-policy">Privacy Policy</a></p>
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
      const btn = document.getElementById('toggleAllChaptersBtn');
      const collapse = lists.length === 0 || !lists[0].classList.contains('hidden');
      lists.forEach((list) => {
        list.classList.toggle('hidden', collapse);
        const arrowIcon = document.getElementById('arrowIcon-' + list.id);
        if (arrowIcon) arrowIcon.textContent = collapse ? '▼' : '▲';
      });
      btn.textContent = collapse ? 'Expand All' : 'Collapse All';
    }

    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');

    function setTheme(isDark) {
      if (isDark) {
        body.classList.add('dark');
        body.classList.remove('light');
        themeToggle.textContent = 'Switch to Light Mode';
        try { localStorage.setItem('theme', 'dark'); } catch (e) {}
      } else {
        body.classList.add('light');
        body.classList.remove('dark');
        themeToggle.textContent = 'Switch to Dark Mode';
        try { localStorage.setItem('theme', 'light'); } catch (e) {}
      }
    }

    let saved;
    try { saved = localStorage.getItem('theme'); } catch (e) { saved = null; }
    setTheme(saved !== 'light');

    themeToggle.addEventListener('click', () => {
      setTheme(!body.classList.contains('dark'));
    });
  </script>

  <script>
    // theater-mode: expands a video embed to the full browser width (breaking out of
    // the .container's 760px max-width), like YouTube's theater mode. Delegated +
    // per-embed since a page may hold several videos.
    (function () {
      function setTheater(embed, toggle, on) {
        embed.classList.toggle('theater-mode', on);
        toggle.textContent = on ? 'Default View' : 'Theater Mode';
        toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
        setTimeout(function () {
          window.dispatchEvent(new Event('resize'));
        }, 300);
      }

      document.addEventListener('click', function (e) {
        var toggle = e.target.closest('.theater-toggle-btn');
        if (!toggle) return;
        var embed = toggle.closest('.video-embed');
        if (!embed) return;
        setTheater(embed, toggle, !embed.classList.contains('theater-mode'));
      });

      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.video-embed.theater-mode').forEach(function (embed) {
          var toggle = embed.querySelector('.theater-toggle-btn');
          if (toggle) setTheater(embed, toggle, false);
        });
      });
    })();
  </script>

  <script>
    // auto-hide-controls: fades the theater-mode toggle and 3Speak badge out while
    // a native <video> is playing and the pointer is idle, like YouTube's own
    // control bar. Only applies to embeds that hold a real <video> (the 3Speak
    // HLS player) -- YouTube iframes keep their badge.
    (function () {
      document.querySelectorAll('.video-embed').forEach(function (embed) {
        var video = embed.querySelector('video');
        var toggle = embed.querySelector('.theater-toggle-btn');
        if (!video || !toggle) return;
        var hideTimer = null;

        function showControls() {
          embed.classList.remove('controls-hidden');
        }

        function scheduleHide() {
          clearTimeout(hideTimer);
          if (video.paused || video.ended) return;
          hideTimer = setTimeout(function () {
            embed.classList.add('controls-hidden');
          }, 2000);
        }

        video.addEventListener('play', scheduleHide);
        video.addEventListener('pause', showControls);
        video.addEventListener('ended', showControls);
        embed.addEventListener('mousemove', function () {
          showControls();
          scheduleHide();
        });
        embed.addEventListener('mouseleave', scheduleHide);
      });
    })();
  </script>

  <script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
  <script>
    // speak-video-hls: plays each 3Speak-hosted HLS stream embedded above directly
    // (via hls.js). Manifest URLs are resolved at build time (see resolve3Speak in
    // build.mjs); re-run the build to refresh them.
    (function () {
      var videos = ${JSON.stringify(videos)};
      videos.forEach(function (v) {
        if (!v.src) return;
        var video = document.getElementById(v.id);
        if (!video) return;
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = v.src;
        } else if (window.Hls && Hls.isSupported()) {
          var hls = new Hls();
          hls.loadSource(v.src);
          hls.attachMedia(video);
        }
      });
    })();
  </script>

  <script>
    // image-lightbox: click any post-body image to pop it out full-viewport, with
    // prev/next via on-screen arrows and keyboard arrows.
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

  <!-- PAGEVIEW-TRACKING-INSERTED --><script src="/main_js/track.js" defer></script>
</body>
</html>
`;
}

async function main() {
  console.log(`Fetching @${AUTHOR}/${PERMLINK} from api.hive.blog ...`);
  const post = await fetchPost();
  console.log(`Got post: "${post.title}"`);

  checkSlugMatch(post);

  const html = await buildPage(post);
  const outPath = join(__dirname, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
