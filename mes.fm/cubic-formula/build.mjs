// Build-time generator for mes.fm/cubic-formula and its 8 supporting video pages.
//
// Fetches @mes/dzekfnxh ("Cubic Formula Proof") from Hive's public bridge API and
// writes a static index.html, then does the same for each of the 8 sibling
// video posts in CHILDREN below, writing one mes.fm/<slug>/index.html each
// (video + description + timestamps, plus the matching section of the main
// article's written notes, mirrored in). This is NOT run by Vercel -- run it
// manually (`npm run build`) whenever a Hive article changes, then commit the
// generated pages.
//
// Same architecture as mes.fm/vector-functions-problems-plus/build.mjs (which
// this was cloned from), except that one also relies on hand-built sibling
// pages; here the siblings are generated too, from child-template.html (cut
// from mes.fm/problems-plus-4-curvature-parametric-integrals):
//   * bare 3Speak / YouTube URLs become Theater-Mode video embeds (3Speak plays
//     its HLS manifest directly via hls.js, resolved at build time).
//   * every top-level "# " heading becomes a collapsible chapter with a
//     "Collapse All" toolbar and a "Jump to" table of contents.
//   * a Playlist chapter (Grid View / List View) of the sibling video pages.
//
// Usage:
//   npm install
//   npm run build

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Committed cache of scraped Playlist card data (see resolvePlaylistMeta). Kept
// in git so a later build still has thumbnails/links even if a target page is
// briefly unreachable.
const PLAYLIST_CACHE_PATH = join(__dirname, "playlist-meta.json");

const AUTHOR = "mes";
const PERMLINK = "dzekfnxh";
const COMMUNITY = "hive-128780";
const PEAKD_URL = `https://peakd.com/${COMMUNITY}/@${AUTHOR}/${PERMLINK}`;
const CANONICAL = "https://mes.fm/cubic-formula";
const BACK_LINK = "https://mes.fm/links";
const YT_PLAYLIST = "https://www.youtube.com/playlist?list=PLai3U8-WIK0EF05ExjzLbB64NgUjoV1hl";

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

// ---------------------------------------------------------------------------
// Playlist section -- Grid/List toggle of the 8 sibling video pages (see
// CHILDREN below, which is what generates them). Scrapes each page's own
// og:title/og:image plus its "Watch on:" source-list row (3Speak, YouTube,
// Telegram, BitChute, Odysee, Rumble -- whichever it actually links) so the
// List view can show every platform link that page itself has. Until a page is
// deployed the live scrape 404s, so buildChildPage()'s own metadata seeds the
// cache (see resolvePlaylistMeta's `seed`).
// ---------------------------------------------------------------------------

const PLAYLIST = [
  { href: "https://mes.fm/quadratic-formula-complete-square" },
  { href: "https://mes.fm/quadratic-formula-pq-substitution" },
  { href: "https://mes.fm/cubic-formula-step-1-pq-substitution" },
  { href: "https://mes.fm/cubic-formula-step-2-vieta-substitution" },
  { href: "https://mes.fm/cubic-formula-step-3-first-solution-y" },
  { href: "https://mes.fm/cube-root-unity" },
  { href: "https://mes.fm/cubic-formula-step-4-solutions-y-cube-root-unity" },
  { href: "https://mes.fm/cubic-formula-step-5-solve-x" },
];

function loadPlaylistCache() {
  if (!existsSync(PLAYLIST_CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(PLAYLIST_CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function savePlaylistCache(cache) {
  const sorted = Object.fromEntries(
    Object.keys(cache).sort().map((k) => [k, cache[k]])
  );
  writeFileSync(PLAYLIST_CACHE_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

function decodePlaylistEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, "’")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readPlaylistMetaTag(html, prop) {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = html.match(new RegExp(`<meta[^>]+property=(["'])${p}\\1[^>]*\\bcontent=(["'])([\\s\\S]*?)\\2`, "i"));
  return m ? decodePlaylistEntities(m[3]).trim() : "";
}

// Pull every {label, href} pair out of the page's own `<li>Watch on: <a...>3Speak</a>
// &middot; <a...>YouTube</a> ...</li>` source-list row -- whatever platforms that
// specific page actually links to.
function readWatchOnLinks(html) {
  const m = html.match(/<li>\s*Watch on:([\s\S]*?)<\/li>/i);
  if (!m) return [];
  const linkRe = /<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  const links = [];
  let lm;
  while ((lm = linkRe.exec(m[1]))) {
    links.push({ label: decodePlaylistEntities(lm[2]).trim(), href: lm[1] });
  }
  return links;
}

async function fetchPlaylistMeta(url) {
  const res = await fetch(url, { headers: { "User-Agent": "mes.fm-build/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return {
    title: readPlaylistMetaTag(html, "og:title"),
    image: readPlaylistMetaTag(html, "og:image"),
    watchLinks: readWatchOnLinks(html),
  };
}

async function resolvePlaylistMeta(entries, seed = {}, concurrency = 6) {
  const cache = loadPlaylistCache();
  // Freshly generated child pages aren't deployed yet, so the live scrape below
  // 404s for them -- start from their own just-built metadata instead. A
  // successful live scrape (once deployed) overwrites the seed.
  for (const [url, m] of Object.entries(seed)) cache[url] = m;
  const urls = entries.map((e) => e.href);
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        cache[url] = await fetchPlaylistMeta(url);
        console.log(`  playlist meta ok:   ${url}`);
      } catch (err) {
        console.warn(`  playlist meta FAIL: ${url} (${err.message}) — using cached value`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  savePlaylistCache(cache);
  return cache;
}

function cssSafeUrl(url) {
  return String(url).split("'").join("%27");
}

// Renders the Playlist chapter's Grid View (thumbnail cards, default) and List
// View (title + full thumbnail + row of every platform link that page has).
function buildPlaylistSection(meta) {
  const cards = PLAYLIST.map((entry) => {
    const m = meta[entry.href] || {};
    const title = m.title || entry.href;
    const thumbStyle = m.image
      ? ` style="background-image:url('${cssSafeUrl(escapeHtml(m.image))}')"`
      : "";
    return `<a class="link-card" href="${escapeHtml(entry.href)}">
  <span class="link-card-thumb"${thumbStyle}></span>
  <span class="link-card-body">
    <span class="link-card-title">${escapeHtml(title)}</span>
    <span class="link-card-readmore">Watch &rarr;</span>
  </span>
</a>`;
  }).join("\n");

  // Watch-on links are sorted to this canonical platform order (whichever the
  // page actually has); anything scraped that isn't in this list (an "etc.")
  // is kept, appended after the recognized ones in its original order.
  const PLATFORM_ORDER = ["3Speak", "YouTube", "Telegram", "BitChute", "Odysee", "Rumble"];
  function sortWatchLinks(links) {
    const known = PLATFORM_ORDER
      .map((label) => links.find((l) => l.label === label))
      .filter(Boolean);
    const rest = links.filter((l) => !PLATFORM_ORDER.includes(l.label));
    return [...known, ...rest];
  }

  const rows = PLAYLIST.map((entry) => {
    const m = meta[entry.href] || {};
    const title = m.title || entry.href;
    const allLinks = [{ label: "Notes", href: entry.href }, ...sortWatchLinks(m.watchLinks || [])];
    const linksHtml = allLinks
      .map((l) => `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`)
      .join(" - ");
    const imgHtml = m.image
      ? `<img class="playlist-row-thumb" src="${escapeHtml(m.image)}" alt="">`
      : "";
    return `<h2>${escapeHtml(title)}</h2>
<p>${linksHtml}</p>
${imgHtml}`;
  }).join("\n");

  return `<p class="section-standalone-link"><a href="${YT_PLAYLIST}" target="_blank" rel="noopener">&#9654;&#65039; Playlist</a></p>
<div class="view-toggle">
  <button type="button" class="view-toggle-btn active" id="playlistGridBtn">Grid View</button>
  <button type="button" class="view-toggle-btn" id="playlistListBtn">List View</button>
</div>
<div class="card-grid" id="playlistGrid">
${cards}
</div>
<div class="playlist-list-view view-hidden" id="playlistList">
${rows}
</div>`;
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

// Give every chapter heading an id and collect a {id, label} list so the
// table-of-contents can link to it. Chapter headings are every top-level "# "
// heading (rendered as <h1> by marked) plus any centered "## <center>..." one
// (MES uses a centered h2 for a few section headers, e.g. "Links and Calculus
// Book Chapter") -- those get promoted to <h1> first so wrapChaptersInToggles
// picks them up too. Duplicate slugs/labels get a "(2)"-style suffix.
function addSectionAnchors(bodyHtml) {
  const seen = new Map();
  const toc = [];
  const promoted = bodyHtml.replace(
    /<h2><center>([\s\S]*?)<\/center><\/h2>/g,
    "<h1><center>$1</center></h1>"
  );
  const html = promoted.replace(/<h1>([\s\S]*?)<\/h1>/g, (match, inner) => {
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

// Same id scheme as addSectionAnchors, exported as a function so the child pages
// can deep-link into the written notes ("#step-1-get-rid-of-x2-term-...").
function headingSlug(innerHtml) {
  const plain = innerHtml
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  return (
    plain
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

// The "Step N: ..." notes sections are <h2>s inside the "Derivation of Cubic
// Formula" chapter (and "Recap on the Quadratic Formula" one before it), which
// addSectionAnchors leaves un-id'd. Give every remaining <h2> an id so
// mes.fm/cubic-formula#step-1-... works; duplicates get a "-2" suffix.
function addH2Anchors(html) {
  const seen = new Map();
  return html.replace(/<h2>([\s\S]*?)<\/h2>/g, (match, inner) => {
    const slug = headingSlug(inner);
    const n = (seen.get(slug) || 0) + 1;
    seen.set(slug, n);
    return `<h2 id="${n === 1 ? slug : `${slug}-${n}`}">${inner}</h2>`;
  });
}

// The Hive post opens with a <center> block: a linked thumbnail of the 3Speak
// video and the row of watch links. Rewrite it into what the shared embed
// pipeline expects (as in the vector-functions-problems-plus post): a bare
// 3Speak URL on its own line (-> Theater-Mode <video>) first, and the links row
// (minus its self-referencing "Notes" link) after the description, ahead of the
// topic image, with the YouTube playlist added.
function restructureBody(body) {
  const head = body.match(
    /<center>\s*\n\s*\[!\[\]\([^)]*\)\]\((https:\/\/3speak\.tv\/watch\?v=[^)]+)\)\s*\n\s*(\[Notes\][^\n]*)\n\s*<\/center>\s*\n\s*---\s*\n/
  );
  if (!head) throw new Error("Unexpected Hive post header: <center> video/links block not found.");
  const embedUrl = head[1];
  const linksRow = head[2]
    .replace(/^\[Notes\]\([^)]*\) - /, "")
    .replace(" - [mes.fm/math]", ` - [Playlist](${YT_PLAYLIST}) - [mes.fm/math]`);
  let out = body.replace(head[0], `${embedUrl}\n\n`);
  const img = out.search(/^!\[Cubic Formula\.jpeg\]/m);
  if (img < 0) throw new Error("Topic image not found -- cannot place the links row.");
  return out.slice(0, img) + linksRow + "\n\n" + out.slice(img);
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

async function buildPage(post, playlistMeta) {
  const title = post.title;
  const { markdown: withVideos, videos } = await embed3SpeakLinks(post.body);
  const preprocessed = embedYoutubeLinks(withVideos);
  const { html: anchoredHtml, toc } = addSectionAnchors(marked.parse(preprocessed));
  const parsedBodyHtml = addH2Anchors(anchoredHtml);
  const wrappedBodyHtml = wrapChaptersInToggles(parsedBodyHtml);

  // Everything before the first "# " heading (the video, description, "Watch on"
  // row, timestamps, book references, topic list) becomes its own collapsible
  // "Full Video" chapter, pinned above the article's own sections. The id stays
  // "overview" for anchor stability even though the visible label changed.
  toc.unshift({ id: "overview", label: "Full Video" });
  // The Playlist chapter (Grid/List of the sibling Problems Plus pages) is a
  // hand-maintained section, not parsed from the Hive body, so it isn't picked
  // up by addSectionAnchors -- add it to the TOC manually, first.
  toc.unshift({ id: "playlist", label: "Playlist" });
  // The derivation's "## Step N: ..." sections (Step 0, 1, 2, 3, 4.1, 4.2, 5)
  // are <h2>s inside the "Derivation of Cubic Formula" chapter, so they aren't
  // in `toc` either. List them right under that chapter, indented; the label keeps
  // the heading's own markup (e.g. the x<sup>2</sup> in Step 1).
  const stepEntries = [...parsedBodyHtml.matchAll(/<h2 id="(step-[^"]+)">([\s\S]*?)<\/h2>/g)].map((m) => ({
    id: m[1],
    html: m[2].trim(),
    sub: true,
  }));
  if (stepEntries.length !== 7) {
    throw new Error(`Expected 7 "Step" headings for the Jump-to menu, found ${stepEntries.length}.`);
  }
  const derivationAt = toc.findIndex((t) => t.id === "derivation-of-cubic-formula");
  if (derivationAt < 0) throw new Error('"Derivation of Cubic Formula" chapter not found for the Jump-to menu.');
  toc.splice(derivationAt + 1, 0, ...stepEntries);
  const tocLinksHtml = toc
    .map((t) =>
      t.sub
        ? `<a class="toc-sub" href="#${escapeHtml(t.id)}">${t.html}</a>`
        : `<a href="#${escapeHtml(t.id)}">${escapeHtml(t.label)}</a>`
    )
    .join("\n      ");

  const chaptersToolbar = `<div class="chapters-toolbar">
<button id="toggleAllChaptersBtn" class="theme-toggle-btn toggle-all-chapters-btn" onclick="toggleAllChapters()">Collapse All</button>
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

  const playlistChapter = `<div class="chapter-toggle" id="playlist">
<h1 class="chapter-toggle-header" onclick="toggleChapter('playlist-list')"><center>Playlist <span id="arrowIcon-playlist-list" class="arrow-icon">&#9660;</span></center></h1>
<div id="playlist-list" class="chapter-toggle-list">
${buildPlaylistSection(playlistMeta)}
</div>
</div>
<hr>
`;

  const overviewChapter = `<div class="chapter-toggle" id="overview">
<h1 class="chapter-toggle-header" onclick="toggleChapter('overview-list')"><center>Full Video <span id="arrowIcon-overview-list" class="arrow-icon">&#9660;</span></center></h1>
<div id="overview-list" class="chapter-toggle-list">
${leadingHtml}
</div>
</div>
<hr>
`;

  const bodyHtml = chaptersToolbar + playlistChapter + overviewChapter + restChaptersHtml;

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
    "A complete video derivation of the cubic formula, with written notes for every step: the PQ substitution, Vieta's substitution, the cube root of unity and the final three solutions. Mirrored from the Hive blockchain.";
  const ogImage =
    (post.json_metadata && Array.isArray(post.json_metadata.image) && post.json_metadata.image[0]) ||
    ((String(bodyHtml).match(/<img[^>]+src="([^"]+)"/i) || [])[1]) ||
    "";
  const ogImageTag = ogImage ? `\n  <meta property="og:image" content="${escapeHtml(ogImage)}">` : "";
  const twitterImageTag = ogImage ? `\n  <meta name="twitter:image" content="${escapeHtml(ogImage)}">` : "";

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
  <link rel="canonical" href="${CANONICAL}" />
  <!-- OG-TAGS:START -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="MES Truth">
  <meta property="og:url" content="${CANONICAL}">
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

    .top-bar {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-top: 16px;
    }


    .site-brand { display: flex; align-items: center; gap: 1.5em; min-width: 0; }
    .site-brand-logo-link { display: block; flex: 0 0 auto; }
    .site-brand-logo { display: block; width: 88px; height: 88px; border-radius: 0.35em; flex: 0 0 auto; }
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
       #navbar, toggled by /main_js/main.js) and the blue primary nav bar
       (#info-bar), same markup/behaviour as mes.fm/math. Colors are set on
       #id selectors so the body.light/body.dark "a" color rules don't win. */
    .hamburger-btn {
      flex: 0 0 auto; width: 44px; height: 44px; padding: 0; margin: 0 0 0 4px;
      background: transparent; border: none; cursor: pointer; font-size: 0;
    }
    .hamburger-btn::before {
      content: ""; display: block; margin: 0 auto;
      width: 26px; height: 4px; background: currentColor; border-radius: 1px;
      box-shadow: 0 7px 0 currentColor, 0 -7px 0 currentColor;
    }
    body.light .hamburger-btn { color: #277bb6; }
    body.dark .hamburger-btn { color: #6cb6f5; }
    #navbar { display: none; }
    #navbar.hide {
      display: flex; flex-direction: column; box-sizing: border-box;
      position: absolute; top: 100%; right: 0; z-index: 30;
      width: 16em; max-width: 90vw; max-height: 75vh; overflow-y: auto;
      background-color: #277bb6; border-radius: 0.25em;
      box-shadow: 0 0.25em 1em rgba(0, 0, 0, 0.3);
      list-style: none; margin: 0; padding: 0;
    }
    #navbar li, #info-bar { list-style: none; margin: 0; padding: 0; }
    #navbar .navbar__item:hover { cursor: pointer; }
    #navbar .navbar__link { display: block; color: #ffffff; padding: 0.7em 1em 0.7em 1.4em; text-decoration: none; }
    #navbar .navbar__link--first { padding-top: 0.8em; }
    #navbar .navbar__link:hover:not(.navbar__dropdown-item):not(.active-tab) { background-color: #346689; }
    #navbar .dropdown-symbol { margin-left: 1em; color: #ffffff; }
    #navbar .navbar__dropdown-container { background-color: #eef0ff; margin: 0; padding: 0; }
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
    #navbar .navbar__link.active-tab, #info-bar .info-bar__item__text.active-tab { background-color: #eef0ff; color: #222222; }

    .info-bar-container { margin-top: 12px; }
    .info-bar { display: flex; flex-wrap: wrap; background-color: #277bb6; box-shadow: 0.2em 0.2em 0.5em rgba(0, 0, 0, 0.35); }
    #info-bar .info-bar__item__text { display: block; text-align: center; padding: 0.7em 1em; font-size: 0.9em; color: #ffffff; text-decoration: none; }
    #info-bar .info-bar__item__text:hover:not(.active-tab) { background-color: #346689; }
    @media (max-width: 600px) {
      .info-bar { justify-content: center; }
      #info-bar .info-bar__item__text { min-height: 44px; display: flex; align-items: center; }
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

    /* Text-size control (--ts, set by the header A-/A+ buttons): only prose,
       the byline and the Jump To navigation scale. Uses rem so nested
       lists/quotes don't compound. Playlist cards/rows are excluded. */
    .post-body :is(p, li, blockquote, td, th):not(#playlist *) { font-size: calc(1rem * var(--ts, 1)); }

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
      border-left: 3px solid #277bb6;
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
      font-size: calc(0.85rem * var(--ts, 1));
      opacity: 0.7;
      margin-top: 0.4em;
    }

    .site-footer-note {
      font-size: 0.8em;
      opacity: 0.6;
      text-align: center;
    }

    /* Every chapter (the leading "Full Video" one plus every Hive-sourced "# "
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

    /* Jump-to / deep links land the heading just below the fixed compact-nav bar
       (52px) instead of underneath it. */
    .chapter-toggle[id], h2[id] { scroll-margin-top: 68px; }

    .chapter-toggle-list.hidden {
      display: none;
    }

    /* Pinned to the top of the post body, just under the <hr> that follows the
       article meta -- a collapse/expand-all control anchored to the right edge,
       above the first ("Full Video") chapter. */
    .chapters-toolbar {
      display: flex;
      justify-content: flex-end;
      margin: -0.8em 0 0.4em;
    }

    /* Playlist chapter — Grid View (card-grid, default) / List View toggle for
       the sibling Problems Plus video pages. See buildPlaylistSection() in
       build.mjs. Card-grid styling kept in sync with the identical block in
       mes.fm/911/build.mjs, mes.fm/hutchison/build.mjs, and
       mes.fm/conspiracy/build.mjs. */
    /* whole-playlist link above the Grid/List buttons (as on mes.fm/math-qa) */
    .section-standalone-link {
      margin: 0 0 0.6em;
      font-weight: 600;
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

    .card-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
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
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1.3;
      color: inherit;
    }

    .link-card-readmore {
      font-size: 0.8rem;
      font-weight: 600;
    }

    body.light .link-card-readmore { color: #1a6fb0; }
    body.dark .link-card-readmore { color: #6cb6f5; }

    @media (max-width: 560px) {
      .card-grid { grid-template-columns: 1fr; }
    }

    /* List View -- plain title / links-row / full-thumbnail markup, matching
       how a Hive-sourced "Thumbnail View" chapter (e.g. mes.fm/hutchison's
       Cold Fusion section) already renders each entry: <h2> title, a <p> link
       row, then the full (uncropped) image. */
    .playlist-list-view {
      margin: 0 0 0.4em;
    }

    .playlist-list-view h2 {
      font-size: 1.15em;
      margin: 1.4em 0 0.3em;
    }

    .playlist-list-view h2:first-child {
      margin-top: 0;
    }

    .playlist-list-view p {
      margin: 0 0 0.6em;
    }

    .playlist-row-thumb {
      display: block;
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 0 0 1.2em;
    }

    /* Must come after .card-grid/.playlist-list-view above: same specificity
       (single class), so source order decides the tie -- this needs to win. */
    .view-hidden {
      display: none;
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
        font-size: calc(0.85rem * var(--ts, 1));
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

      /* the "Step N" entries nested under "Derivation of Cubic Formula" */
      .toc-sidebar a.toc-sub {
        padding-left: 1em;
        font-size: 0.92em;
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

    .toc-mobile { font-size: calc(1rem * var(--ts, 1)); }

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

    .toc-mobile a.toc-sub {
      padding-left: 1em;
      font-size: 0.92em;
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
/* Site footer -- same links/markup as mes.fm/math and mes.fm/911, in
       this page family's own blue accent (#277bb6, matching .hamburger-btn/
       .info-bar above) and sized to this family's 760px .container (911
       uses 1180px for its own wider card-grid page). */
    .footer { max-width: 760px; margin: 2.5em auto 0; padding: 2em; background-color: #277bb6; border-radius: 0.35em; }
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
       right end. Ported from mes.fm/math's version (see its build.mjs) --
       this template's top-bar is already a clean flex row (no
       position:absolute/table-cell legacy layout to fight), so no special
       centering workarounds are needed here.

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
      background: #ffffff; border-bottom: 3px solid #277bb6;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      transform: translateY(-110%); transition: transform 0.2s ease;
    }
    #compact-nav.is-visible { display: flex; }
    body.is-stuck #compact-nav { transform: none; }
    #compact-nav .compact-nav-logo { display: block; width: 32px; height: 32px; border-radius: 6px; flex: 0 0 auto; }
    #compact-nav .compact-nav-title {
      flex: 0 1 auto; min-width: 0; font-weight: 700; font-size: 1.05em;
      text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #compact-nav .compact-nav-links { display: flex; flex: 1 1 0; min-width: 0; overflow: hidden; margin: 0 0 0 8px; padding: 0; list-style: none; }
    #compact-nav .compact-nav-links li { flex: 0 0 auto; }
    #compact-nav .compact-nav-links a { display: block; padding: 0 10px; line-height: 52px; font-size: 0.9em; text-decoration: none; white-space: nowrap; }
    #compact-nav .compact-nav-links a:hover { background: rgba(39,123,182,0.12); }
    body.light #compact-nav .compact-nav-title { color: #1a1a1a; }
    body.dark #compact-nav { background: #1a1a1a; }
    body.dark #compact-nav .compact-nav-title { color: #eeeeee; }
    body.light #compact-nav .compact-nav-links a { color: #277bb6; }
    body.dark #compact-nav .compact-nav-links a { color: #6cb6f5; }
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
  <a href="/math" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="https://mes.fm/img/logo-mark.png"></a>
  <a class="compact-nav-title" href="/math" tabindex="-1">MES Math Tutorials</a>
  <ul class="compact-nav-links">
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
  <div class="container">
    <div class="top-bar">
      <div class="site-brand">
        <a class="site-brand-logo-link" href="/math"><img class="site-brand-logo" src="https://mes.fm/img/logo-mark.png" width="88" height="88" alt="MES Math Tutorials logo"></a>
        <div class="site-brand-text"><a class="site-brand-title" href="/math">MES Math Tutorials</a><p class="site-brand-tag">Free math tutorials by Math Easy Solutions.</p></div>
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
        <li class="info-bar__item"><a target="_self" class="info-bar__item__text" href="https://mes.fm/math">Math Tutorials</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href="/calculators">Calculators</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href="/tools">Tools</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href="/mobile-apps">Mobile Apps</a></li>
        <li class="info-bar__item"><a target="_self" class="info-bar__item__text" href="/puzzles">Puzzles</a></li>
        <li class="info-bar__item"><a target="_self" class="info-bar__item__text" href="/memes">Memes</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" target="_blank" rel="nofollow" href="https://matheasy.substack.com/">Subscribe</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" target="_blank" href="https://teespring.com/stores/mes-store">Store</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" target="_blank" href="/donate">Donate</a></li>
        <li class="info-bar__item info-bar__item--utility" style="display:none !important;"><a class="info-bar__item__text" href="/contact">Contact Us</a></li>
        <li class="info-bar__item info-bar__item--mes"><a class="info-bar__item__text" href="/" style="font-weight:bold;">MES.fm</a></li>
      </ul>
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
    <!-- FASTCOMMENTS-BLOCK: Comments toggle + lazy FastComments widget, see main_js/comments.js -->
    <div id="comments-button" class="mes-comments-toggle">Comments</div>
    <div id="comments-box" class="hide"><div id="fastcomments-widget"></div></div>
    <script src="/main_js/comments.js?v=1.0.0" defer></script>


    <hr>

    <a class="source-link" href="${PEAKD_URL}" target="_blank" rel="noopener">Originally published on Hive &rarr;</a>
    <div class="retrieved-note">
      Vote/comment/reblog counts and article text were fetched from the Hive blockchain
      at build time (${escapeHtml(buildDate)}) and are not live.
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
      <a class="footer__text" target="_blank" href="/donate">Donate</a><span class="footer__separator"> | </span><a class="footer__text" target="_blank" rel="nofollow" href="https://matheasy.substack.com/">Subscribe</a>
      <div class="footer__text--extra-info"><span class="footer__text footer__text--copyright">Copyright &copy; <span id="copyright-year">2013</span>&nbsp;Math Easy Solutions</span></div>
    </div>
    <script>document.getElementById('copyright-year').textContent = new Date().getFullYear();</script>
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

    // A Jump-to link (or a #step-... deep link from one of the video pages) can
    // target a heading inside a collapsed chapter, which is display:none and so
    // can't be scrolled to -- expand that chapter first. Runs in the click
    // handler, before the browser performs the anchor jump, and on hashchange.
    function revealChapterFor(hash) {
      if (!hash || hash.length < 2) return;
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      const list = target && target.closest('.chapter-toggle-list');
      if (list && list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        const arrowIcon = document.getElementById('arrowIcon-' + list.id);
        if (arrowIcon) arrowIcon.textContent = '▲';
      }
    }
    document.addEventListener('click', function (e) {
      const link = e.target.closest && e.target.closest('.toc-sidebar a, .toc-mobile a');
      if (link) revealChapterFor(link.hash);
    });
    window.addEventListener('hashchange', function () {
      revealChapterFor(location.hash);
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    });

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
        themeToggle.textContent = '\u2600\ufe0f';
        try { localStorage.setItem('theme', 'dark'); } catch (e) {}
      } else {
        body.classList.add('light');
        body.classList.remove('dark');
        themeToggle.textContent = '\ud83c\udf19';
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
    // playlist-view-toggle: switches the Playlist chapter between Grid View
    // (thumbnail cards, default) and List View (title + full thumbnail + every
    // platform link) -- both are pre-rendered at build time in
    // buildPlaylistSection(), so this just toggles which one is visible.
    (function () {
      var gridBtn = document.getElementById('playlistGridBtn');
      var listBtn = document.getElementById('playlistListBtn');
      var grid = document.getElementById('playlistGrid');
      var list = document.getElementById('playlistList');
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
    })();
  </script>

  <script>
    // text-size control: same STEPS / 'articleFontScale' key as
    // add_text_size_control.py and mes.fm/math. Drives the --ts CSS variable,
    // which only prose (paragraphs/lists/tables), the byline and the Jump To
    // navigation multiply into their font-size -- headings, chapter titles
    // ("Playlist"), cards and buttons stay fixed.
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

// ---------------------------------------------------------------------------
// The 8 supporting video pages: mes.fm/<slug> for each Hive video post below.
// Each page = the video (3Speak HLS via hls.js, YouTube embed as automatic
// fallback), the post's description and timestamps, and the matching section of
// THIS page's written notes (`notes` = start of that section's "## " heading in
// the main article), mirrored in and linked back to it.
//
// `youtube` and `telegram` are set here rather than read from the Hive posts,
// because those posts' link rows are wrong: Step 2's YouTube link is really the
// Completing-the-Square video's, and every post's Telegram link is the *previous*
// video's message (each one is off by one). Both were checked against the
// YouTube playlist (PLai3U8-WIK0EF05ExjzLbB64NgUjoV1hl) and each t.me/meslinks
// message's own caption. Step 5 has no Telegram post that could be found, so
// it links none.
// ---------------------------------------------------------------------------

const CHILD_TEMPLATE_PATH = join(__dirname, "child-template.html");
const SITE_ROOT = join(__dirname, "..");

const CHILDREN = [
  { slug: "quadratic-formula-complete-square", permlink: "hxvofldi", youtube: "H46ILjs10_c", telegram: 28513, notes: "Recap on the Quadratic Formula" },
  { slug: "quadratic-formula-pq-substitution", permlink: "oqzqzhqo", youtube: "tNUp4gi8lxw", telegram: 28534, notes: "Step 0:" },
  { slug: "cubic-formula-step-1-pq-substitution", permlink: "wwtmttrs", youtube: "2OmDtnfdNdc", telegram: 28618, notes: "Step 1:" },
  { slug: "cubic-formula-step-2-vieta-substitution", permlink: "ifdcvhkh", youtube: "zycGv8aRaOA", telegram: 28684, notes: "Step 2:" },
  { slug: "cubic-formula-step-3-first-solution-y", permlink: "daxjedbu", youtube: "7BAJb1gZ1Tg", telegram: 28709, notes: "Step 3:" },
  { slug: "cube-root-unity", permlink: "elspkwga", youtube: "i_LT_0p7K7c", telegram: 28734, notes: "Step 4.1:" },
  { slug: "cubic-formula-step-4-solutions-y-cube-root-unity", permlink: "kosyfghs", youtube: "D5EQJlzgUlE", telegram: 28792, notes: "Step 4.2:" },
  { slug: "cubic-formula-step-5-solve-x", permlink: "vgsyxnty", youtube: "ZpYMkiRIbkU", telegram: null, notes: "Step 5:" },
];

// The main article's "## <notes>" section: heading + markdown body, up to the
// next heading or "---" rule.
function extractNotes(mainBody, notesKey) {
  const lines = mainBody.split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.replace(/^##\s+/, "").startsWith(notesKey));
  if (start < 0) throw new Error(`Notes section "${notesKey}" not found in the main article.`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i]) || /^---\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return {
    headingMd: lines[start].replace(/^##\s+/, "").trim(),
    md: lines.slice(start + 1, end).join("\n").trim(),
  };
}

// "Text: 6:30" / "Text 6:00" / "Text: 0" -> <li>Text &ndash; 6:30</li>
function timestampItem(line) {
  const m = line.match(/^(.*?)(?::\s*|\s+)(\d{1,2}(?::\d{2}){1,2}|0)\s*$/);
  if (!m) return `<li>${marked.parseInline(line)}</li>`;
  const time = m[2] === "0" ? "0:00" : m[2];
  return `<li>${marked.parseInline(m[1].trim())} &ndash; ${time}</li>`;
}

async function fetchHivePost(permlink) {
  const post = await hiveCall("bridge.get_post", { author: AUTHOR, permlink });
  if (!post || !post.body) throw new Error(`Hive API returned no post for @${AUTHOR}/${permlink}.`);
  return post;
}

// Play.3speak.tv's embed API only knows newer videos; older permlinks 404, and
// those are resolved from the video's own Hive metadata (resolve3Speak). `api`
// records which, so the page only calls the API at runtime when it can answer.
async function resolveChildVideo(permlink) {
  try {
    const res = await fetch(`https://play.3speak.tv/api/embed?v=${AUTHOR}/${permlink}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.videoUrl) return { src: data.videoUrl, poster: data.thumbnail || null, api: true };
    }
  } catch {
    /* fall through to Hive metadata */
  }
  const { src, poster } = await resolve3Speak(AUTHOR, permlink);
  return { src, poster, api: false };
}

function childPlayerScripts(child, video) {
  const slug = video.api ? `'${AUTHOR}/${child.permlink}'` : "null";
  return `  <script>
    // auto-hide-controls: fades the theater-mode toggle and video badge out while
    // the video is playing and the pointer is idle, and shows them again on any
    // mouse movement or pause. Works on whichever player is current, so it keeps
    // working if the page falls back to the YouTube embed.
    (function () {
      var embed = document.getElementById('videoEmbed');
      var hideTimer = null;
      function showControls() { embed.classList.remove('controls-hidden'); }
      function scheduleHide() {
        clearTimeout(hideTimer);
        var v = document.getElementById('qVideo');
        if (!v || v.paused || v.ended) return;
        hideTimer = setTimeout(function () { embed.classList.add('controls-hidden'); }, 2000);
      }
      var video = document.getElementById('qVideo');
      video.addEventListener('play', scheduleHide);
      video.addEventListener('pause', showControls);
      video.addEventListener('ended', showControls);
      embed.addEventListener('mousemove', function () { showControls(); scheduleHide(); });
      embed.addEventListener('mouseleave', scheduleHide);
    })();
  </script>

  <script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
  <script>
    // q-video: plays the 3Speak-hosted HLS stream for this video directly (via hls.js),
    // rather than iframing 3speak.tv (whose /embed route has no speed/quality controls and
    // whose /watch page drags in the whole app shell). Gives native browser video controls
    // (speed via the "..." menu in Chromium, fullscreen, PiP).
    //
    // SLUG (set when 3Speak's public embed API knows this video) is resolved at runtime so
    // re-encodes / re-uploads are picked up; FALLBACK_SRC is the manifest resolved at build
    // time from the video's own Hive post, used when the API can't answer (older videos).
    // If playback fails outright the player swaps itself for the YouTube embed.
    (function () {
      var video = document.getElementById('qVideo');
      var embed = document.getElementById('videoEmbed');
      var SLUG = ${slug};
      var FALLBACK_SRC = '${video.src}';
      var YT_ID = '${child.youtube}';
      var fellBack = false;

      function toYouTube() {
        if (fellBack) return;
        fellBack = true;
        var frame = document.createElement('iframe');
        frame.src = 'https://www.youtube-nocookie.com/embed/' + YT_ID;
        frame.title = 'YouTube video';
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        frame.allowFullscreen = true;
        embed.replaceChild(frame, video);
        var badge = embed.querySelector('.video-badge');
        badge.href = 'https://youtu.be/' + YT_ID;
        badge.innerHTML = 'View on YouTube &nearr;';
        embed.classList.remove('controls-hidden');
      }

      function play(src) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src;
          video.addEventListener('error', toYouTube);
        } else if (window.Hls && Hls.isSupported()) {
          var hls = new Hls();
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, function (e, data) { if (data && data.fatal) toYouTube(); });
        } else {
          toYouTube();
        }
      }

      if (!SLUG) { play(FALLBACK_SRC); return; }
      fetch('https://play.3speak.tv/api/embed?v=' + SLUG)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { play((d && d.videoUrl) || FALLBACK_SRC); })
        .catch(function () { play(FALLBACK_SRC); });
    })();
  </script>`;
}

// Builds one child page. Returns { html, meta } where meta is the Playlist card
// data (title / image / watch links) for this page, used to seed playlist-meta.json.
async function buildChildPage(child, mainBody, template) {
  const post = await fetchHivePost(child.permlink);
  const url = `https://mes.fm/${child.slug}`;

  // Same guard as checkSlugMatch: the post links back to its own mes.fm page.
  const selfLinked = post.body.includes(`mes.fm/${child.slug}`);
  console.log(`  ${child.slug}: "${post.title}" ${selfLinked ? "(OK — post self-references this slug)" : "(NO self-reference found)"}`);
  if (!selfLinked && process.env.ALLOW_SLUG_MISMATCH !== "1") {
    throw new Error(`Post @${AUTHOR}/${child.permlink} does not link to mes.fm/${child.slug} -- permlink/slug out of sync?`);
  }
  const postYouTube = (post.body.match(/\[YouTube\]\(https:\/\/youtu\.be\/([\w-]+)\)/) || [])[1];
  if (postYouTube && postYouTube !== child.youtube) {
    console.log(`    note: post links YouTube ${postYouTube}, using verified ${child.youtube}`);
  }

  // ---- parse the post
  const above = post.body.split(/\n-{10,}\n/)[0];
  const afterHeader = above.replace(/^<center>[\s\S]*?<\/center>\s*\n\s*---\s*\n/, "");
  const rowAt = afterHeader.search(/^\[Notes\]\(/m);
  if (rowAt < 0) throw new Error(`Unexpected layout in @${AUTHOR}/${child.permlink}: links row not found.`);
  const descHtml = marked
    .parse(afterHeader.slice(0, rowAt).trim())
    .trim()
    .split("\n")
    .map((l) => `      ${l}`)
    .join("\n");
  const rest = afterHeader.slice(rowAt);
  const topicImage = (rest.match(/^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/m) || [])[1];
  const tsBlock = (rest.match(/###\s*Time\s?stamps\s*\n([\s\S]*?)(?:\n###|$)/i) || [])[1] || "";
  const tsItems = tsBlock
    .split("\n")
    .filter((l) => /^\s*-\s/.test(l))
    .map((l) => timestampItem(l.replace(/^\s*-\s+/, "").trim()));

  // ---- notes from the main article
  const { headingMd, md } = extractNotes(mainBody, child.notes);
  const headingHtml = marked.parseInline(headingMd);
  const anchor = headingSlug(headingHtml);
  const notesHtml = marked.parse(md).replace(/<img /g, '<img loading="lazy" class="sol-image" ');

  // ---- video
  const video = await resolveChildVideo(child.permlink);
  if (!video.src) throw new Error(`Could not resolve a 3Speak manifest for @${AUTHOR}/${child.permlink}.`);
  const poster =
    (post.json_metadata && Array.isArray(post.json_metadata.image) && post.json_metadata.image[0]) ||
    video.poster ||
    topicImage ||
    "";

  const threeSpeakUrl = `https://3speak.tv/watch?v=${AUTHOR}/${child.permlink}`;
  const watchLinks = [
    { label: "3Speak", href: threeSpeakUrl },
    { label: "YouTube", href: `https://youtu.be/${child.youtube}` },
    ...(child.telegram ? [{ label: "Telegram", href: `https://t.me/meslinks/${child.telegram}` }] : []),
  ];
  const watchOnHtml = watchLinks
    .map((l) => `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`)
    .join(" &middot; ");

  const firstPara = (marked.parse(afterHeader.slice(0, rowAt).trim()).match(/<p>([\s\S]*?)<\/p>/) || [])[1] || "";
  const plainFirst = firstPara
    .replace(/<sup>([^<]*)<\/sup>/g, "^$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  let blurb = plainFirst.length > 190 ? plainFirst.slice(0, 190).replace(/\s+\S*$/, "") : plainFirst;
  if (blurb.length < plainFirst.length) {
    const sentenceEnd = Math.max(blurb.lastIndexOf(". "), blurb.lastIndexOf("? "));
    blurb = sentenceEnd > 80 ? blurb.slice(0, sentenceEnd + 1) : blurb.replace(/[,;:]$/, "") + "...";
  }
  const description = `${post.title}. ${blurb} Mirrored from the Hive blockchain.`;
  const retrieved = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const article = `      <div class="video-embed" id="videoEmbed" google-side-rail-overlap="false">
        <video id="qVideo" controls playsinline preload="metadata" poster="${escapeHtml(poster)}"></video>
        <button class="theater-toggle-btn" id="theaterToggle" type="button" aria-pressed="false">Theater Mode</button>
        <a class="video-badge" href="${threeSpeakUrl}" target="_blank" rel="noopener">View on 3Speak &nearr;</a>
      </div>

${descHtml}
${
  topicImage
    ? `
      <img loading="lazy" src="${escapeHtml(topicImage)}" alt="" style="max-width:100%;height:auto;border-radius:4px;display:block;margin:0.6em 0 1.4em;">
`
    : ""
}
      <details class="timestamps" open>
        <summary>Timestamps</summary>
        <ul>
          ${tsItems.join("\n          ")}
        </ul>
      </details>

      <details class="written-solution" open>
        <summary>Notes: ${headingHtml}</summary>
        <p class="ws-note">Written notes &mdash; mirrored from <a href="${CANONICAL}#${anchor}">Cubic Formula Proof</a>, which walks through the complete derivation.</p>
${notesHtml}
      </details>

      <ul class="source-list">
        <li>Watch on: ${watchOnHtml}</li>
        <li>Full written notes: <a href="${CANONICAL}">Cubic Formula Proof</a></li>
        <li>Playlist: <a href="${YT_PLAYLIST}" target="_blank" rel="noopener">Cubic Formula Proof YouTube playlist</a></li>
        <li>More math: <a href="https://mes.fm/math">mes.fm/math</a></li>
      </ul>

      <hr>

      <a class="source-link" href="https://peakd.com/${COMMUNITY}/@${AUTHOR}/${child.permlink}" target="_blank" rel="noopener">Originally posted on the Hive blockchain &rarr;</a>
      <div class="retrieved-note">Text and image retrieved from the Hive blockchain on ${retrieved}.</div>`;

  const html = template
    .replaceAll("@@DESC@@", escapeHtml(description))
    .replaceAll("@@SLUG@@", child.slug)
    .replaceAll("@@TITLE@@", escapeHtml(post.title))
    .replaceAll("@@OGIMAGE@@", escapeHtml(poster))
    .replaceAll(
      "@@PARTOF@@",
      `Part of <a href="/cubic-formula">Cubic Formula Proof</a> &middot; <a href="/cubic-formula#${anchor}">Full written notes &amp; video &rarr;</a>`
    )
    .replaceAll(
      "@@SUBTITLE@@",
      `Video &middot; ${formatDate(post.created)} &middot; mirrored from the <a href="https://peakd.com/${COMMUNITY}/@${AUTHOR}/${child.permlink}">Hive blockchain</a>`
    )
    .replaceAll("@@VIDEO_SCRIPTS@@", childPlayerScripts(child, video))
    .replaceAll("@@ARTICLE@@", article);
  if (html.includes("@@")) throw new Error(`Unfilled placeholder left in ${child.slug}`);

  return { html, meta: { title: post.title, image: poster, watchLinks }, url };
}

async function main() {
  console.log(`Fetching @${AUTHOR}/${PERMLINK} from api.hive.blog ...`);
  const post = await fetchPost();
  console.log(`Got post: "${post.title}"`);

  checkSlugMatch(post);

  // The 8 sibling pages first: their own metadata seeds the Playlist cards
  // (they aren't deployed yet, so scraping them live would 404).
  console.log(`Building ${CHILDREN.length} supporting video pages ...`);
  const template = readFileSync(CHILD_TEMPLATE_PATH, "utf8");
  const seed = {};
  for (const child of CHILDREN) {
    const { html, meta, url } = await buildChildPage(child, post.body, template);
    const dir = join(SITE_ROOT, child.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), addImageLazyLoading(html), "utf8");
    seed[url] = meta;
  }

  console.log(`Resolving Playlist metadata for ${PLAYLIST.length} pages ...`);
  const playlistMeta = await resolvePlaylistMeta(PLAYLIST, seed);

  const html = await buildPage({ ...post, body: restructureBody(post.body) }, playlistMeta);
  const outPath = join(__dirname, "index.html");
  writeFileSync(outPath, addImageLazyLoading(html), "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
