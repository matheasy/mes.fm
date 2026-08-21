// Build-time generator for mes.fm/hutchison-tom-sky.
//
// Fetches the post from Hive's public bridge API and writes a static index.html.
// This is NOT run by Vercel — run it manually (`npm run build`) whenever you want
// to refresh the vote/comment counts, then commit the regenerated index.html.
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
const PERMLINK = "john-hutchison-interviewed-224";
const COMMUNITY = "hive-128780";
const PEAKD_URL = `https://peakd.com/${COMMUNITY}/@${AUTHOR}/${PERMLINK}`;

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

// This post opens with a bare 3Speak embed URL on its own line (PeakD renders
// these as an embedded player). Iframing 3Speak's own /embed route ships their
// full app chrome (logo, unrelated video sidebar, oddly proportioned player)
// even in "embed" mode, so instead fetch the direct HLS manifest from 3Speak's
// public embed API and play it in a plain <video> tag -- same approach as
// mes.fm/log1/tesla-coil. Each bare 3Speak URL becomes its own <video> with a
// unique id; the {id, src} pairs are wired up by a script block appended
// below once the whole page (with hls.js loaded) exists.
async function embed3SpeakLinks(markdown) {
  const pattern = /^[ \t]*https?:\/\/play\.3speak\.tv\/embed\?v=([\w.-]+)\/([\w.-]+)[ \t]*$/gm;
  const matches = [...markdown.matchAll(pattern)];
  const videos = [];
  let html = markdown;
  for (let i = 0; i < matches.length; i++) {
    const [full, owner, permlink] = matches[i];
    const id = `speak-video-${i + 1}`;
    let src = null;
    let poster = null;
    try {
      const res = await fetch(`https://play.3speak.tv/api/embed?v=${owner}/${permlink}`);
      const data = await res.json();
      src = data.videoUrl || null;
      poster = data.thumbnail || null;
    } catch {
      // Best-effort: leave src/poster null, the <video> just renders without one.
    }
    videos.push({ id, src });
    const posterAttr = poster ? ` poster="${escapeHtml(poster)}"` : "";
    const replacement = `<div class="video-embed"><video id="${id}" controls playsinline preload="metadata"${posterAttr}></video><a class="video-badge" href="https://3speak.tv/watch?v=${owner}/${permlink}" target="_blank" rel="noopener">View on 3Speak &rarr;</a></div>`;
    html = html.replace(full, replacement);
  }
  return { markdown: html, videos };
}

async function buildPage(post) {
  const title = post.title;
  const { markdown: withVideos, videos } = await embed3SpeakLinks(fixTableBoundaries(post.body));
  const preprocessed = embedYoutubeLinks(withVideos);
  const bodyHtml = marked.parse(preprocessed);
  const publishedDate = formatDate(post.created);
  const voteCount = post.stats?.total_votes ?? 0;
  const commentCount = post.children ?? 0;
  const reblogCount = post.reblogs ?? 0;
  const description =
    post.json_metadata?.description ||
    `${title} — mirrored from the Hive blockchain.`;
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
  <link rel="canonical" href="https://mes.fm/hutchison-tom-sky" />
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
      font-size: 1.8em;
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

    .post-body h3 {
      font-size: 1.15em;
      margin: 1.6em 0 0.5em;
    }

    .post-body img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 0.6em 0;
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
      margin: 1.2em 0;
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

    @media (max-width: 600px) {
      h1 { font-size: 1.4em; }
      body { padding: 0 12px 40px; }
    }
  </style>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1461238060884369"
 crossorigin="anonymous"></script>
<script>
/* autoads-header-gap-guard: guards two gaps against Google Auto ads (in-page ad blocks,
   class \`google-auto-placed\`), plus Google's separate "annotation" text-ad
   formats, which are a different Auto ads mechanism than the in-page blocks
   above. 1) Logo header <-> nav bar: on desktop, any in-page ad caught here
   is relocated to just below the whole header+nav+logo-badge complex
   (before .outer-page-content) and allowed to show if it fills; on mobile
   (max-width: 768px, this repo's existing responsive breakpoint) it is
   hidden outright instead -- no ad shows below the nav bar on mobile at
   all. 2) Comments toggle (#comments-button) <-> comments widget
   (#comments-box): on every device, any in-page ad caught here is relocated
   to just after the comments box and allowed to show if it fills.
   3) Annotation/related-entry chips -- any element carrying the
   \`google-anno-skip\` class, which covers every chip variant Google serves
   (\`google-anno-sc\` pill/badge tooltips, \`goog-rentry\` related-entry
   tooltips, \`google-anno-sa-qtx\` tooltip text) -- and 4) in-text link ads
   (\`<a class="google-anno">\` wrapping a \`<span class="google-anno-t">\`
   around an ordinary word, e.g. turning "Calculate" into a
   double-underlined, clickable ad): both are only guarded inside #header,
   #footer, the top .info-bar-container nav, or the .side-bar "Site
   Navigation" widget -- chips are hidden outright there, and in-text links
   are unwrapped back to plain text there, so the word stays readable
   without the ad behavior. Elsewhere in the actual page content both are
   left alone on purpose. Unlike the in-page ad blocks, Google serves many
   of these chips/links per page load, so removing the guarded-zone ones
   doesn't cost the page its one shot at an ad the way deleting the in-page
   block did -- no relocate/poll needed, just hide/unwrap on sight.
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
            if (handleHeaderNavZone(node)) return;
            handleCommentsZone(node);
            return;
        }
        if (handleAnnotationChip(node)) return;
        if (handleInTextLinkAd(node)) return;
        if (node.querySelectorAll) {
            node.querySelectorAll('.google-auto-placed').forEach(function (n) {
                if (handleHeaderNavZone(n)) return;
                handleCommentsZone(n);
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
</head>
<body class="dark">
  <div class="container">
    <div class="top-bar">
      <a class="site-link" href="https://mes.fm/hutchison">&larr; mes.fm/hutchison</a>
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

    <div class="ad-slot" style="text-align: center;">
      <!-- MES Links Square -->
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-1461238060884369"
           data-ad-slot="1197859571"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>

    <hr>

    <div class="post-body">
${bodyHtml}
    </div>

    <hr>

    <a class="peakd-link" href="${PEAKD_URL}" target="_blank" rel="noopener">Originally published on Hive &rarr;</a>
    <p class="build-note">
      Vote/comment/reblog counts and article text were fetched from the Hive blockchain
      at build time (${buildDate}) and are not live.
    </p>
  </div>

  <script>
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
    // ad-slot-fill-and-collapse: requests a fill for the manual "MES Links Square" ad unit at
    // the top of the page, then hides it completely -- no reserved blank box left behind -- if
    // it never receives a real ad, whether that's because nothing filled or because an ad
    // blocker kept the request from ever completing. Same poll-for-an-iframe, hide-if-none-shows
    // approach as collapseIfUnfilled in the Auto ads guard script above.
    (function () {
      document.querySelectorAll('.ad-slot ins.adsbygoogle').forEach(function () {
        (adsbygoogle = window.adsbygoogle || []).push({});
      });
      document.querySelectorAll('.ad-slot').forEach(function (slot) {
        var attempts = 0;
        var poll = setInterval(function () {
          attempts++;
          if (slot.querySelector('iframe')) {
            clearInterval(poll);
            return;
          }
          if (attempts >= 10) {
            slot.style.setProperty('display', 'none', 'important');
            clearInterval(poll);
          }
        }, 200);
      });
    })();
  </script>

  <script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
  <script>
    // speak-video-hls: plays each 3Speak-hosted HLS stream embedded above directly
    // (via hls.js) rather than iframing 3speak.tv -- see embed3SpeakLinks in build.mjs
    // for why. Same pattern as mes.fm/log1/tesla-coil's tesla-spark-video script,
    // generalized to loop over however many videos this post embeds.
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
</body>
</html>
`;
}

async function main() {
  console.log(`Fetching @${AUTHOR}/${PERMLINK} from api.hive.blog ...`);
  const post = await fetchPost();
  console.log(`Got post: "${post.title}" (${post.stats?.total_votes ?? 0} votes, ${post.children ?? 0} comments, ${post.reblogs ?? 0} reblogs)`);

  const html = await buildPage(post);
  const outPath = join(__dirname, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
