// Build-time generator for mes.fm/911-alchemy.
//
// Fetches the post from Hive's public bridge API and writes a static index.html.
// This is NOT run by Vercel — run it manually (`npm run build`) whenever the Hive
// article changes, then commit the regenerated index.html.
//
// Usage:
//   npm install
//   npm run build
//
// Same scaffold as mes.fm/jerry-leaphart-dew and mes.fm/911-jumper-launched (the
// other 9/11 clip mirrors that link back to mes.fm/911), plus the multi-video
// embed + Theater Mode handling from mes.fm/hutchison-tom-sky: every bare YouTube
// URL on its own line becomes a responsive iframe, and every bare 3Speak URL
// becomes a direct HLS <video>, each with a theater-mode toggle.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AUTHOR = "mestruth";
const PERMLINK = "911-alchemy-by-wolf-clan-media-7xn";
const COMMUNITY = "hive-113182";
const PEAKD_URL = `https://peakd.com/${COMMUNITY}/@${AUTHOR}/${PERMLINK}`;
const CANONICAL = "https://mes.fm/911-alchemy";
const BACK_LINK = "https://mes.fm/911";

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
// plain <video> (native speed/quality/PiP controls) instead of iframing 3speak.tv
// and inheriting their whole app shell. Try 3Speak's public embed API first; if
// that 404s (older permlinks aren't all indexed), fall back to the 3Speak video's
// own Hive post metadata, which carries the IPFS manifest hash. Re-encodes /
// re-uploads keep the permlink, so re-running this build picks them up.
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
// script block once hls.js has loaded. The pattern is anchored to a whole line
// (^...$) so it only touches standalone embeds, never the same URL appearing
// inside a "[3Speak](...)" link in a link row.
async function embed3SpeakLinks(markdown) {
  const pattern =
    /^[ \t]*https?:\/\/(?:play\.)?3speak\.tv\/(?:watch|embed)\?v=([\w.-]+)\/([\w.-]+)[ \t]*$/gm;
  const matches = [...markdown.matchAll(pattern)];
  const videos = [];
  const resolved = [];

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

async function buildPage(post) {
  const title = post.title;
  const { markdown: withVideos, videos } = await embed3SpeakLinks(post.body);
  const preprocessed = embedYoutubeLinks(withVideos);
  const bodyHtml = marked.parse(preprocessed);
  const publishedDate = formatDate(post.created);
  const buildDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const description =
    (post.json_metadata && post.json_metadata.description) ||
    "The 3-part 9/11 Alchemy documentary series by Chris Hampton and Mark Conlon of Wolf Clan Media -- Free Energy & Free Thinking, Facing Reality, and A Big Idea -- with embedded videos. Mirrored from the Hive blockchain.";

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
      font-size: 1.8em;
      margin: 0.4em 0 0.1em;
    }

    .page-subtitle {
      font-size: 0.85em;
      opacity: 0.75;
      margin-bottom: 1.4em;
    }

    .post-body {
      word-wrap: break-word;
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
    }

    .post-body ul {
      padding-left: 1.3em;
    }

    .post-body li {
      margin: 0 0 0.5em;
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

    hr {
      margin: 2em 0;
      opacity: 0.3;
    }

    .site-footer-note {
      font-size: 0.8em;
      opacity: 0.6;
      text-align: center;
    }

    @media (max-width: 600px) {
      h1 { font-size: 1.4em; }
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
</head>
<body class="dark">
  <div class="container">
    <div class="top-bar">
      <a class="site-link" href="${BACK_LINK}">&larr; mes.fm/911</a>
      <button id="themeToggle" class="theme-toggle-btn">Loading...</button>
    </div>

    <h1>${escapeHtml(title)}</h1>
    <div class="page-subtitle">Documentary series &middot; ${escapeHtml(publishedDate)} &middot; mirrored from the <a href="${PEAKD_URL}" target="_blank" rel="noopener">Hive blockchain</a></div>

    <article class="post-body">
${bodyHtml}
      <hr>

      <a class="source-link" href="${PEAKD_URL}" target="_blank" rel="noopener">Originally posted on the Hive blockchain &rarr;</a>
      <div class="retrieved-note">Text retrieved from the Hive blockchain on ${escapeHtml(buildDate)}.</div>
    </article>

    <hr>

    <p class="site-footer-note"><a href="https://mes.fm/privacy-policy">Privacy Policy</a></p>
  </div>

  <script>
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
    // the .container's 760px max-width), like YouTube's theater mode. Height is capped
    // at min(85vh, 56.25vw) so ultra-wide viewports don't get a comically tall player.
    // Delegated + per-embed (rather than fixed IDs) since this page embeds several
    // videos -- three YouTube iframes and one 3Speak HLS <video>.
    (function () {
      function setTheater(embed, toggle, on) {
        embed.classList.toggle('theater-mode', on);
        toggle.textContent = on ? 'Default View' : 'Theater Mode';
        toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
        // AdSense's side rail ads only re-check google-side-rail-overlap exclusion
        // zones on scroll/resize, not on a plain class-driven layout change, so nudge
        // it to recompute once the width/height transition above has settled.
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
    // a native <video> is playing and the pointer is idle, like YouTube's own control
    // bar. Reappear on any mouse movement over that player, and stay visible whenever
    // it's paused. Only applies to embeds that hold a real <video> (the 3Speak HLS
    // player) -- YouTube iframes keep their badge since we can't see the iframe's
    // play state.
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
    // (via hls.js) rather than iframing 3speak.tv. Manifest URLs are resolved at
    // build time (see resolve3Speak in build.mjs); re-run the build to refresh them.
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

  <!-- PAGEVIEW-TRACKING-INSERTED --><script src="/main_js/track.js" defer></script>
</body>
</html>
`;
}

async function main() {
  console.log(`Fetching @${AUTHOR}/${PERMLINK} from api.hive.blog ...`);
  const post = await fetchPost();
  console.log(`Got post: "${post.title}"`);

  const html = await buildPage(post);
  const outPath = join(__dirname, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
