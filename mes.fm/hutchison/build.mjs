// Build-time generator for mes.fm/hutchison.
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
const PERMLINK = "hutchisoneffect";
const PEAKD_URL = `https://peakd.com/science/@${AUTHOR}/${PERMLINK}`;

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

function buildPage(post) {
  const title = post.title;
  const preprocessed = embedYoutubeLinks(fixTableBoundaries(fixHutchisonDriveLink(post.body)));
  const { html: bodyHtml, toc } = addSectionAnchors(marked.parse(preprocessed));
  const tocLinksHtml = toc
    .map((t) => `<a href="#${escapeHtml(t.id)}">${escapeHtml(t.label)}</a>`)
    .join("\n      ");
  const publishedDate = formatDate(post.created);
  const voteCount = post.stats?.total_votes ?? 0;
  const commentCount = post.children ?? 0;
  const reblogCount = post.reblogs ?? 0;
  const description =
    post.json_metadata?.description ||
    `${title} — an index of MES Hutchison Effect videos, mirrored from the Hive blockchain.`;
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
      font-size: 1.15em;
      margin: 1.6em 0 0.5em;
    }

    .post-body img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
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

    /* Table of contents: a fixed side column on wide viewports (there's only
       room beside the centered 760px .container once the window is wide
       enough not to overlap it), collapsing to a <details> dropdown above
       the article on anything narrower -- laptops with a non-maximized
       window, tablets, and phones alike. */
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
  </style>
</head>
<body class="dark">
  <nav class="toc-sidebar" aria-label="Table of contents">
    <div class="toc-title">Jump to</div>
      ${tocLinksHtml}
  </nav>
  <div class="container">
    <div class="top-bar">
      <a class="site-link" href="https://mes.fm/links">&larr; mes.fm/links</a>
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

</body>
</html>
`;
}

async function main() {
  console.log(`Fetching @${AUTHOR}/${PERMLINK} from api.hive.blog ...`);
  const post = await fetchPost();
  console.log(`Got post: "${post.title}" (${post.stats?.total_votes ?? 0} votes, ${post.children ?? 0} comments, ${post.reblogs ?? 0} reblogs)`);

  const html = buildPage(post);
  const outPath = join(__dirname, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
