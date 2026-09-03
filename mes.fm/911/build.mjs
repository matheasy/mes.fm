// Build-time generator for mes.fm/911.
//
// Fetches @mes/911 from Hive's public bridge API and writes a static index.html,
// mirroring the collapsible-chapter + "Jump to" table-of-contents layout used by
// mes.fm/hutchison. This is NOT run by Vercel -- run it manually (`npm run
// build`) whenever you want to pull in Hive edits or refresh the vote counts,
// then commit the regenerated index.html.
//
// Two chapters are hand-maintained here (not part of the Hive article) and pinned
// above the article's own "Important Links" chapter: "Posts" and "Videos". Edit
// POSTS_CHAPTER / VIDEOS_CHAPTER below to add to them. The old flat link list that
// used to live on this page is appended into the article's "Important Links"
// chapter under a "More MES 9/11 Links" sub-heading (OLD_LINKS_HTML).
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
const PERMLINK = "911";
const PEAKD_URL = `https://peakd.com/truth/@${AUTHOR}/${PERMLINK}`;

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

// The post's top-level section headers (the "# <center>X</center>" lines --
// Important Links, ✈️#911Truth Video Series, 9/11 Observable Evidence, etc.) all
// render as <h1><center>X</center></h1> in the parsed body. Give each one an id
// and collect a {id, label} list so the table-of-contents can link straight to
// it. Duplicate slugs/labels get a "(2)"-style suffix to stay unique.
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
// so every chapter can be collapsed via toggleChapter(). The leading <hr> stays
// outside the div, as the visual divider between chapters.
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

// "Posts" and "Videos" aren't part of the Hive article -- they're hand-maintained
// chapters of mirrored mes.fm pages (e.g. mes.fm/cat-wdttg-book) that we keep
// adding to without re-publishing the Hive post. Pinned to the top of the TOC and
// spliced in as the first two chapters, above the article's "Important Links".
const POSTS_CHAPTER = `<div class="chapter-toggle" id="posts">
<h1 class="chapter-toggle-header" onclick="toggleChapter('posts-list')"><center>Posts <span id="arrowIcon-posts-list" class="arrow-icon">&#9660;</span></center></h1>
<ul id="posts-list" class="chapter-toggle-list">
<li><a href="https://mes.fm/matthew-naus-g-edward-griffin-wdtttg-book">Matthew Naus Gave G. Edward Griffin the WDTTTG Book in 2012</a></li>
<li><a href="https://mes.fm/kj-french-911-100k">French 9/11 Researcher KJ Hits 100k Views in 24 Hours</a></li>
<li><a href="https://mes.fm/bought-911-hutchison-shirt">Someone bought a 9/11 DJW Book shirt and Hutchison Effect shirt</a></li>
<li><a href="https://mes.fm/csis-911-lights">CSIS Posts a Photo of the 9/11 Tribute in Light "Blue Beam" Lights</a></li>
<li><a href="https://mes.fm/cat-wdttg-book">Story Time with Cat and Dr. Judy Wood's WDTTG Book</a></li>
</ul>
</div>
<hr>
`;

const VIDEOS_CHAPTER = `<div class="chapter-toggle" id="videos">
<h1 class="chapter-toggle-header" onclick="toggleChapter('videos-list')"><center>Videos <span id="arrowIcon-videos-list" class="arrow-icon">&#9660;</span></center></h1>
<ul id="videos-list" class="chapter-toggle-list">
<li><a href="https://mes.fm/911-coat-jumper">Alleged Launched Person Is Actually a Coat and NOT a 9/11 Jumper</a></li>
<li><a href="https://mes.fm/richard-gage-flat-earth">Mr. Richard Gage Doesn't Know if the Earth Is Round or Flat</a></li>
<li><a href="https://mes.fm/eric-larson-lies">Author Eric Larson Speaks About Our Current Culture and Nation of Lies</a></li>
<li><a href="https://mes.fm/jerry-leaphart-dew">Attorney Jerry Leaphart on NIST Hiring Military Contractors that Specialize in DEW and PsyOps</a></li>
<li><a href="https://mes.fm/one-armed-twin">Occult Connections: The One-Armed Twin in Star Wars, 9/11, and The Matrix</a></li>
<li><a href="https://mes.fm/ashton-forbes-letter">Highlights from the Letter that Ashton Forbes Totally Didn't Write to Himself</a></li>
<li><a href="https://mes.fm/stanley-praimnath-jumpers">9/11 Survivor Stanley Praimnath says the jumpers and paper were sucked out from the windows</a></li>
<li><a href="https://mes.fm/911-jumper-launched">Rare Footage of 9/11 Jumper appears to be Launched Laterally with Great Force from the North Tower</a></li>
</ul>
</div>
<hr>
`;

// The flat link list that used to be the bulk of this page, moved verbatim into
// the article's "Important Links" chapter (see the OLD_LINKS_HTML splice in
// buildPage). Some entries duplicate links the Hive article already lists.
const OLD_LINKS_HTML = `<h2>More MES 9/11 Links</h2>
<ul>
<li><a href="https://mes.fm/911-alchemy">9/11 Alchemy by Wolf Clan Media</a></li>
<li><a href="https://peakd.com/c/hive-113182">HIVE Community</a></li>
<li><a href="https://www.reddit.com/r/911TruthMES/">Reddit r/911TruthMES</a></li>
<li><a href="https://peakd.com/truth/@mes/911">HIVE Links and Notes</a></li>
<li>9/11 Truth files: <a href="https://mes.fm/911truth">mes.fm/911truth</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0EzqTamtIXtgX8QudQSxuxh">YouTube Playlist</a></li>
<li style="margin-left: 20px;"><a href="https://mes.fm/911truth-playlist">mes.fm/911truth-playlist</a></li>
<li style="margin-left: 20px;"><a href="https://peakd.com/hive-113182/@mes/deja-vu2-youtube-removes-my-911truth-part-2-video">YouTube removes Part 2</a></li>
<li style="margin-left: 20px;"><a href="https://peakd.com/hive-113182/@mes/youtube-removes-my-911truth-part-7-video-for-hate-speech">YouTube removes Part 7</a></li>
<li style="margin-left: 20px;"><a href="https://t.me/meslinks/19514">YouTube removed Part 11 for 7 months</a></li>
<li><a href="https://www.bitchute.com/playlist/MSsLsRJrMPJt/">BitChute Playlist</a></li>
<li style="margin-left: 20px;"><a href="https://mes.fm/911truth-bitchute">mes.fm/911truth-bitchute</a></li>
<li><a href="https://odysee.com/$/playlist/a4981c9731bec068847fd370b593769304b0b181">Odysee Playlist</a></li>
<li><a href="https://rumble.com/playlists/fkQOVpQ7tZ0">Rumble Playlist</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0G_HHWt33moIqEeUBP3cgCh">9/11 Observable Evidence YouTube Playlist</a></li>
<li style="margin-left: 20px;">This is an 11 hour documentary made by <a href="https://www.checktheevidence.com/wordpress/2021/12/27/9-11-liars-for-truth-what-happened-on-9-11-and-how-it-was-covered-up/">anonymous authors</a> which I am dubbing over with my voice.</li>
<li style="margin-left: 20px;">I also include other video clips in this playlist that don't make it onto my main 9/11 Truth video series.</li>
<li><a href="https://www.wheredidthetowersgo.com/buy/">Where Did The Towers Go? By Dr. Judy Wood</a></li>
<li style="margin-left: 20px;"><a href="https://mes.fm/judywoodbook">mes.fm/judywoodbook</a></li>
<li><a href="https://www.facebook.com/groups/911TruthMovement">9/11 Forensic Evidence Study Group</a></li>
<li><a href="https://peakd.com/hive-113182/@mes/gaqombxg">900ft Spire Turning to Dust</a></li>
<li><a href="https://peakd.com/hive-113182/@mes/lazaqoat">Toasted Cars</a></li>
<li><a href="https://peakd.com/hive-113182/@mes/ndloyfuv">Twisted Steel</a></li>
<li><a href="https://snipboard.io/ulLJIT.jpg">Before and After Photo</a> of the WTC while Building 7 is still standing showing the rubble is mainly ground level.</li>
<li><a href="https://x.com/MathEasySolns/status/1688765811497091072">Richard D. Hall's 9/11 Planes Radar Analysis</a></li>
<li style="margin-left: 20px;"><a href="https://t.me/meslinks/17095">Bunker buster missile vs 2nd plane impact</a></li>
<li style="margin-left: 20px;"><a href="https://www.checktheevidence.com/wordpress/2007/10/02/going-in-search-of-planes-in-nyc/">Andrew Johnson's "planes" witnesses study</a></li>
<li><a href="https://www.youtube.com/@911PlanesResearch">9/11 Planes Researcher</a></li>
<li><a href="https://www.checktheevidence.com/">Check The Evidence</a></li>
<li style="margin-left: 20px;"><a href="https://peakd.com/hive-113182/@mes/andrew-johnsons-911-books-2011-finding-the-truth-and-2017-holding-the-truth">Andrew Johnson's books: 9/11 Finding and Holding the Truth</a></li>
<li>🗣 <a href="https://www.youtube.com/playlist?list=PLdwkvCI5-tzw">Bob Greenyer says the darnedest things</a> 😹</li>
<li style="margin-left: 20px;"><a href="https://mes.fm/bg-wildin">mes.fm/bg-wildin</a></li>
<li><a href="https://t.me/meslinks/23567?comment=25240">Disinfo Agent Ace Baker pushing CGI disinfo and faking his death.</a></li>
<li><a href="https://t.me/meslinks/18941">MES confronting disinfo agent Richard Gage</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0FUd8p-bzqCVSDd6gOcHcDr">1109 music album by Keor Meteor</a></li>
<li>X Threads</li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1807634322394103895">Very little heat on 9/11</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1774679023370834358">Building 7 falling quietly</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1770320084650864746">WTC literally turning to dust</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1760368820315988275">Twisted steel</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1756373125422526612">Toasted cars</a></li>
<li style="margin-left: 20px;"><a href="https://x.com/MathEasySolns/status/1752373887814521142">Hutchison Effect</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0GlfVj5AYNtbF688pr8fk9X">Hutchison Effect playlist</a></li>
<li><a href="https://rumble.com/playlists/ZZ7ZMxinb6g">Matthew Naus DVD playlist</a></li>
<li><a href="https://mes.fm/911djw">DJW Links</a></li>
</ul>
`;

function buildPage(post) {
  const title = post.title;
  const preprocessed = embedYoutubeLinks(fixTableBoundaries(post.body));
  const { html: parsedBodyHtml, toc } = addSectionAnchors(marked.parse(preprocessed));
  const wrappedBodyHtml = wrapChaptersInToggles(parsedBodyHtml);

  // Front of the TOC: the two hand-maintained chapters, then the article's own
  // sections ("Important Links" first, already in `toc` from the Hive body).
  toc.unshift({ id: "videos", label: "Videos" });
  toc.unshift({ id: "posts", label: "Posts" });
  const tocLinksHtml = toc
    .map((t) => `<a href="#${escapeHtml(t.id)}">${escapeHtml(t.label)}</a>`)
    .join("\n      ");

  // A collapse/expand-all control, pinned to the top of the post body so
  // "Collapse All" folds every chapter including "Posts" and "Videos".
  const chaptersToolbar = `<div class="chapters-toolbar">
<button id="toggleAllChaptersBtn" class="theme-toggle-btn" onclick="toggleAllChapters()">Collapse All</button>
</div>
`;

  // The article's one-line intro sits before the first "# <center>" section --
  // keep it as a plain lead paragraph above the toolbar, not a chapter.
  const firstChapterMatch = wrappedBodyHtml.match(/<hr>\n<div class="chapter-toggle" id="/);
  if (!firstChapterMatch) {
    throw new Error("No wrapped chapters found — the Hive article structure changed.");
  }
  const leadingHtml = wrappedBodyHtml.slice(0, firstChapterMatch.index).trim();
  const restChaptersHtml = wrappedBodyHtml.slice(
    firstChapterMatch.index + "<hr>\n".length
  );

  // Splice the old flat link list into the article's "Important Links" chapter
  // (the first chapter in restChaptersHtml), just before its closing tags.
  const boundary = '</div>\n</div>\n<hr>\n<div class="chapter-toggle"';
  if (!restChaptersHtml.includes(boundary)) {
    throw new Error("Could not find the Important Links chapter boundary to splice into.");
  }
  const restWithOldLinks = restChaptersHtml.replace(
    boundary,
    OLD_LINKS_HTML + boundary
  );

  const bodyHtml =
    leadingHtml +
    "\n\n" +
    chaptersToolbar +
    POSTS_CHAPTER +
    VIDEOS_CHAPTER +
    restWithOldLinks;

  const publishedDate = formatDate(post.created);
  const voteCount = post.stats?.total_votes ?? 0;
  const commentCount = post.children ?? 0;
  const reblogCount = post.reblogs ?? 0;
  const description =
    post.json_metadata?.description ||
    "MES 9/11 Truth -- the full #911Truth video series, observable-evidence clips, livestreams, and links, mirrored from the Hive blockchain.";
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
  <meta name="keywords" content="MES, 9/11, Truth, Math Easy Solutions">
  <meta name="author" content="MES">
  <link rel="canonical" href="https://mes.fm/911" />
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

    /* Every chapter (the hand-maintained "Posts" / "Videos" ones plus every
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
       above the first ("Posts") chapter. */
    .chapters-toolbar {
      display: flex;
      justify-content: flex-end;
      margin: -0.8em 0 0.4em;
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

  const html = buildPage(post);
  const outPath = join(__dirname, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
